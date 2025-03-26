# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
import logging

_logger = logging.getLogger(__name__)

class PaymentTransaction(models.Model):
    """ Inherits payment.transaction """
    _inherit = 'payment.transaction'

    capture_manually = fields.Boolean(related='provider_id.capture_manually',
                                      string="Capture Manually",
                                      help='Enable manual capturing')
    cybersource_response_code = fields.Char(string="CyberSource Response Code", 
                                           help="Response code returned by CyberSource API")
    cybersource_response_message = fields.Char(string="CyberSource Response Message",
                                              help="Message returned by CyberSource API")
    cybersource_device_fingerprint = fields.Char(string="Device Fingerprint",
                                               help="Device fingerprint ID used for fraud detection")

    def action_cybersource_set_done(self):
        """ Set the state of the transaction to 'done'."""
        self.handle_notification()

    def action_cybersource_set_canceled(self):
        """Set the state of the transaction to 'cancel'"""
        self.handle_notification()

    def action_cybersource_set_error(self):
        """Set the state of the transaction to 'error'"""
        self.handle_notification()

    def handle_notification(self):
        """This is used to handle the notification"""
        self.ensure_one()
        if self.provider_code != 'cybersource':
            return
        notification_data = {'reference': self.reference,
                             'simulated_state': 'error'}
        self._handle_notification_data('cybersource', notification_data)

    @api.model
    def _get_tx_from_notification_data(self, provider_code, data):
        """ Find the transaction based on the notification data."""
        tx = super()._get_tx_from_notification_data(provider_code, data)
        if provider_code != 'cybersource':
            return tx
        reference = data.get('reference')
        tx = self.search(
            [('reference', '=', reference),
             ('provider_code', '=', 'cybersource')])
        if not tx:
            raise ValidationError(
                "Cyber Source " + _(
                    "No transaction found matching reference %s.", reference)
            )
        return tx

    def _process_notification_data(self, notification_data):
        """ Update the transaction state and the provider reference based on the
         notification data.
        This method should usually not be called directly. The correct method to
         call upon receiving
        notification data is :meth:`_handle_notification_data`.
        For a provider to handle transaction processing, it must overwrite this
        method and process
        the notification data.
        """
        super()._process_notification_data(notification_data)
        if self.provider_code != 'cybersource':
            return
            
        self.provider_reference = f'cybersource-{self.reference}'
        
        # Store CyberSource specific data
        self.cybersource_response_code = notification_data.get('cybersource_status', '')
        self.cybersource_response_message = notification_data.get('message', '')
        
        # Store device fingerprint if provided
        if notification_data.get('device_fingerprint'):
            self.cybersource_device_fingerprint = notification_data.get('device_fingerprint')
            _logger.info("Stored device fingerprint: %s", self.cybersource_device_fingerprint)
        
        # Log transaction details for debugging
        _logger.info(
            "Processing CyberSource transaction %s with state: %s, status: %s", 
            self.reference,
            notification_data.get('simulated_state', ''),
            notification_data.get('cybersource_status', '')
        )
        
        # Process based on the simulated_state sent from the controller
        state = notification_data.get('simulated_state')
        
        if state == 'done':
            # Transaction is successful - either automatically capture or set as authorized
            if self.capture_manually and not notification_data.get('manual_capture'):
                _logger.info("Setting transaction %s to authorized", self.reference)
                self._set_authorized()
            else:
                _logger.info("Setting transaction %s to done", self.reference)
                self._set_done()
                if self.operation == 'refund':
                    self.env.ref('payment.cron_post_process_payment_tx')._trigger()
        elif state == 'pending':
            _logger.info("Setting transaction %s to pending", self.reference)
            self._set_pending()
        elif state == 'cancel':
            _logger.info("Setting transaction %s to canceled", self.reference)
            self._set_canceled(state_message=f"Payment was declined: {notification_data.get('message', 'No message')}")
        elif state == 'error':
            _logger.info("Setting transaction %s to error", self.reference)
            self._set_error(_(
                "Payment processing error: %s", 
                notification_data.get('message', 'Unknown error')
            ))
        else:
            # Default case - should not reach here with proper controller response handling
            _logger.warning(
                "Unknown transaction state '%s' for CyberSource transaction %s", 
                state, self.reference
            )
            self._set_error(_("Unexpected payment status"))