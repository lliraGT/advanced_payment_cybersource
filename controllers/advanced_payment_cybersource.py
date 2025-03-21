# -*- coding: utf-8 -*-
import json
import os
from CyberSource import *
from CyberSource.logging.log_configuration import LogConfiguration
from odoo import _, http
from odoo.exceptions import ValidationError
from odoo.http import request
import logging
_logger = logging.getLogger(__name__)


class WebsiteSaleFormCyberSource(http.Controller):
    """ This class is used to do the payment """
    @http.route('/payment/cybersource/simulate_payment', type='json',
                auth='public')
    def payment_with_flex_token(self, **post):
        """ This is used for Payment processing using the flex token """
        address = request.env['res.partner'].browse(
            post.get('values')['partner'])
        client_reference_information = Ptsv2paymentsClientReferenceInformation(
            code=post.get('reference'))
        processing_information_capture = False
        if post:
            processing_information_capture = True
        processing_information = Ptsv2paymentsProcessingInformation(
            capture=processing_information_capture,
            commerce_indicator="vbv")
        
        # Using tokenized card with security code
        payment_information_tokenized_card = Ptsv2paymentsPaymentInformationTokenizedCard(
            number=post.get('customer_input')['card_num'],
            expiration_month=post.get('customer_input')['exp_month'],
            expiration_year=post.get('customer_input')['exp_year'],
            security_code=post.get('customer_input')['cvv'],  # Security code added
            transaction_type="1")
        
        payment_information = Ptsv2paymentsPaymentInformation(
            tokenized_card=payment_information_tokenized_card.__dict__)
            
        order_information_amount_details = Ptsv2paymentsOrderInformationAmountDetails(
            total_amount=post.get('values')['amount'],
            currency=request.env['res.currency'].browse(
                post.get('values')['currency']).name)
                
        order_information_bill_to = Ptsv2paymentsOrderInformationBillTo(
            first_name=address.name.split(' ')[0] if len(address.name.split(' ')) > 0 else address.name,
            last_name=address.name.split(' ')[1] if len(address.name.split(' ')) > 1 else '',
            address1=address.street or '',
            locality=address.city or '',
            administrative_area=address.state_id.code if address.state_id else "CA",
            postal_code=address.zip or '',
            country=address.country_id.code if address.country_id else "US",
            email=address.email or '',
            phone_number=address.phone or '')
            
        order_information = Ptsv2paymentsOrderInformation(
            amount_details=order_information_amount_details.__dict__,
            bill_to=order_information_bill_to.__dict__)
            
        consumer_authentication_information = Ptsv2paymentsConsumerAuthenticationInformation(
            cavv="AAABCSIIAAAAAAACcwgAEMCoNh+=",
            xid="T1Y0OVcxMVJJdkI0WFlBcXptUzE=")
            
        # Add device fingerprint 
        device_fingerprint = post.get('customer_input').get('device_fingerprint', '')
        _logger.info("Using device fingerprint: %s", device_fingerprint)
        
        # Create device information object with fingerprint
        device_information = Ptsv2paymentsDeviceInformation(
            fingerprint_session_id=device_fingerprint)
            
        # Create the request object with all parameters including device info
        request_obj = CreatePaymentRequest(
            client_reference_information=client_reference_information.__dict__,
            processing_information=processing_information.__dict__,
            payment_information=payment_information.__dict__,
            order_information=order_information.__dict__,
            consumer_authentication_information=consumer_authentication_information.__dict__,
            device_information=device_information.__dict__)
            
        request_obj = self.del_none(request_obj.__dict__)
        
        # Log the complete request (with masked sensitive data)
        masked_request = dict(request_obj)
        if 'payment_information' in masked_request and 'tokenized_card' in masked_request['payment_information']:
            if 'number' in masked_request['payment_information']['tokenized_card']:
                masked_request['payment_information']['tokenized_card']['number'] = 'XXXX' + masked_request['payment_information']['tokenized_card']['number'][-4:]
            if 'security_code' in masked_request['payment_information']['tokenized_card']:
                masked_request['payment_information']['tokenized_card']['security_code'] = 'XXX'
        
        _logger.info("CyberSource request data: %s", json.dumps(masked_request))
        
        request_obj = json.dumps(request_obj)
        
        try:
            _logger.info("Creating payment request")
            client_config = self.get_configuration()
            api_instance = PaymentsApi(client_config)
            return_data, status, body = api_instance.create_payment(request_obj)
            
            # Log the response for debugging
            _logger.info("CyberSource response - Status: %s, Body: %s", status, body)
            
            # Parse the response body
            response_data = json.loads(body) if body else {}
            
            # According to CyberSource API docs, HTTP 201 with status AUTHORIZED is a successful transaction
            if status == 201:
                # Get CyberSource status
                cybersource_status = response_data.get('status', '')
                
                # Map the status to the appropriate Odoo transaction state
                if cybersource_status == 'AUTHORIZED':
                    # For HTTP 201 + status AUTHORIZED, this is a successful transaction
                    transaction_state = 'done'  # Set to 'done' for Odoo to mark it as successful
                    _logger.info("Payment successfully AUTHORIZED")
                elif cybersource_status == 'PARTIAL_AUTHORIZED':
                    transaction_state = 'done'
                    _logger.info("Payment PARTIAL_AUTHORIZED")
                elif cybersource_status == 'AUTHORIZED_PENDING_REVIEW':
                    transaction_state = 'pending'
                    _logger.info("Payment AUTHORIZED_PENDING_REVIEW")
                elif cybersource_status == 'DECLINED':
                    transaction_state = 'cancel'
                    _logger.info("Payment was DECLINED")
                elif cybersource_status == 'PENDING':
                    transaction_state = 'pending'
                    _logger.info("Payment is PENDING")
                else:
                    # Default to done for any other successful status
                    transaction_state = 'done'
                    _logger.info("Payment status: %s (mapped to done)", cybersource_status)
                
                # Build the notification data
                status_data = {
                    'reference': post.get('reference'),
                    'payment_details': post.get('customer_input')['card_num'],
                    'simulated_state': transaction_state,  # This is what Odoo will use
                    'cybersource_status': cybersource_status,  # Store the original status
                    'manual_capture': False,  # Set to True for manual capture if needed
                    'device_fingerprint': device_fingerprint,  # Store the device fingerprint
                }
                
                # Process the transaction with the data
                request.env['payment.transaction'].sudo()._handle_notification_data(
                    'cybersource', status_data)
                
                return return_data
            else:
                # Non-201 status means there was an error
                _logger.error("Payment request failed - HTTP Status: %s", status)
                error_message = "Payment processing error"
                if 'message' in response_data:
                    error_message = response_data.get('message')
                    
                raise ValidationError(_(error_message))
                
        except Exception as e:
            _logger.error("Exception when calling PaymentsApi->create_payment: %s", e)
            raise ValidationError(_("Payment processing error: %s") % str(e))

    def get_configuration(self):
        """ This is used for Payment provider configuration """
        record = request.env['payment.provider'].sudo().search(
            [('code', '=', 'cybersource')])
        configuration_dictionary = {
            "authentication_type": "http_signature",
            "merchantid": record.cyber_merchant,
            "run_environment": "apitest.cybersource.com",
            "request_json_path": "",
            "key_alias": "testrest",
            "key_password": "testrest",
            "key_file_name": "testrest",
            "keys_directory": os.path.join(os.getcwd(), "resources"),
            "merchant_keyid": record.cyber_key,
            "merchant_secretkey": record.cyber_secret_key,
            "use_metakey": False,
            "portfolio_id": "",
            "timeout": 1000,
        }
        log_config = LogConfiguration()
        log_config.set_enable_log(True)
        log_config.set_log_directory(os.path.join(os.getcwd(), "Logs"))
        log_config.set_log_file_name("cybs")
        log_config.set_log_maximum_size(10487560)
        log_config.set_log_level("Debug")
        log_config.set_enable_masking(False)
        log_config.set_log_format(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        log_config.set_log_date_format("%Y-%m-%d %H:%M:%S")
        configuration_dictionary["log_config"] = log_config
        return configuration_dictionary

    def del_none(self, data):
        """ This is used to checks any value having null """
        for key, value in list(data.items()):
            if value is None:
                del data[key]
            elif isinstance(value, dict):
                self.del_none(value)
        return data