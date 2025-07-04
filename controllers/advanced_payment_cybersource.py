# -*- coding: utf-8 -*-
# Import Python's standard logging first to avoid conflicts
import logging
_logger = logging.getLogger(__name__)

import json
import os
from CyberSource import *
from CyberSource.logging.log_configuration import LogConfiguration
from odoo import _, http
from odoo.exceptions import ValidationError
from odoo.http import request


class WebsiteSaleFormCyberSource(http.Controller):
    """ This class is used to do the payment """
    @http.route('/payment/cybersource/is_enabled', type='json', auth='public')
    def is_cybersource_enabled(self):
        """Check if CyberSource is enabled and configured"""
        provider = request.env['payment.provider'].sudo().search([
            ('code', '=', 'cybersource'),
            ('state', '!=', 'disabled')
        ], limit=1)
        return bool(provider)
    
    @http.route('/payment/cybersource/get_merchant_id', type='json', auth='public')
    def get_merchant_id(self):
        """Return the merchant ID for the current provider"""
        provider = request.env['payment.provider'].sudo().search([
            ('code', '=', 'cybersource'),
            ('state', '!=', 'disabled')
        ], limit=1)
        return provider.cyber_merchant if provider else False
    
    @http.route('/payment/cybersource/get_fingerprint_container', type='json', auth='public')
    def get_fingerprint_container(self):
        """Return HTML for fingerprint container to be inserted on payment pages"""
        provider = request.env['payment.provider'].sudo().search([
            ('code', '=', 'cybersource'),
            ('state', '!=', 'disabled')
        ], limit=1)
        
        if not provider:
            return ""
            
        # Generate fingerprint container html
        return """
            <div id="cybersource_df_container" class="d-none">
                <!-- Container for CyberSource device fingerprint -->
            </div>
        """
    
    @http.route('/payment/cybersource/simulate_payment', type='json',
                auth='public')
    def payment_with_flex_token(self, **post):
        """ This is used for Payment processing using the flex token """
        try:
            # Get partner information with proper access control
            partner_id = post.get('values', {}).get('partner')
            if partner_id:
                try:
                    # Try to access partner with sudo if public user
                    address = request.env['res.partner'].sudo().browse(partner_id)
                    # Verify the partner exists and we can access it
                    if not address.exists():
                        raise ValidationError(_("Partner not found"))
                except Exception as e:
                    _logger.warning("Could not access partner %s: %s", partner_id, e)
                    # Create a default address if we can't access the partner
                    address = request.env['res.partner'].sudo().create({
                        'name': 'Payment Customer',
                        'email': 'payment@example.com',
                        'street': 'Default Address',
                        'city': 'Default City',
                        'zip': '00000',
                        'country_id': request.env.ref('base.gt').id,  # Guatemala
                        'state_id': request.env.ref('base.state_gt_01').id if request.env.ref('base.state_gt_01', False) else False,
                    })
            else:
                # Create default partner if none provided
                address = request.env['res.partner'].sudo().create({
                    'name': 'Payment Customer',
                    'email': 'payment@example.com',
                    'street': 'Default Address',
                    'city': 'Default City',
                    'zip': '00000',
                    'country_id': request.env.ref('base.gt').id,
                })
            
            client_reference_information = Ptsv2paymentsClientReferenceInformation(
                code=post.get('reference'))
            processing_information_capture = False
            if post:
                processing_information_capture = True
            
            # Check if we need 3D Secure authentication
            # Try without 3D Secure first, then add it if required
            use_3ds = post.get('use_3ds', False)
            
            if use_3ds:
                # Include 3D Secure information if explicitly requested or if previous attempt failed
                processing_information = Ptsv2paymentsProcessingInformation(
                    capture=processing_information_capture,
                    commerce_indicator="vbv")
            else:
                # Try without 3D Secure first
                processing_information = Ptsv2paymentsProcessingInformation(
                    capture=processing_information_capture)
            
            # Using tokenized card with security code
            payment_information_tokenized_card = Ptsv2paymentsPaymentInformationTokenizedCard(
                number=post.get('customer_input')['card_num'],
                expiration_month=post.get('customer_input')['exp_month'],
                expiration_year=post.get('customer_input')['exp_year'],
                security_code=post.get('customer_input')['cvv'],
                transaction_type="1")
            
            payment_information = Ptsv2paymentsPaymentInformation(
                tokenized_card=payment_information_tokenized_card.__dict__)
                
            # Get currency information safely
            currency_id = post.get('values', {}).get('currency')
            if currency_id:
                try:
                    currency = request.env['res.currency'].sudo().browse(currency_id)
                    currency_code = currency.name if currency.exists() else 'GTQ'
                except:
                    currency_code = 'GTQ'  # Default to GTQ
            else:
                currency_code = 'GTQ'
                
            order_information_amount_details = Ptsv2paymentsOrderInformationAmountDetails(
                total_amount=post.get('values')['amount'],
                currency=currency_code)
                    
            order_information_bill_to = Ptsv2paymentsOrderInformationBillTo(
                first_name=address.name.split(' ')[0] if len(address.name.split(' ')) > 0 else address.name,
                last_name=address.name.split(' ')[1] if len(address.name.split(' ')) > 1 else '',
                address1=address.street or 'Default Address',
                locality=address.city or 'Guatemala',
                administrative_area=address.state_id.code if address.state_id else "01",
                postal_code=address.zip or '01007',
                country=address.country_id.code if address.country_id else "GT",
                email=address.email or 'payment@example.com',
                phone_number=address.phone or '12345678')
                
            order_information = Ptsv2paymentsOrderInformation(
                amount_details=order_information_amount_details.__dict__,
                bill_to=order_information_bill_to.__dict__)
                
            # Add device fingerprint - Extract from customer_input 
            device_fingerprint = post.get('customer_input', {}).get('device_fingerprint', '')
            _logger.info("Using device fingerprint: %s", device_fingerprint)

            if not device_fingerprint:
                _logger.warning("No device fingerprint provided in payment request")
                
            # Get the merchant ID for creating the proper session ID
            merchant_id = post.get('values', {}).get('merchant_id') or self._get_cybersource_merchant_id()
            
            # Construct the full session ID as expected by CyberSource
            session_id = f"{merchant_id}{device_fingerprint}" if merchant_id and device_fingerprint else ""
            _logger.info("Using session ID for device fingerprint: %s", session_id)
                
            # Print the full post data for debugging (with sensitive data masked)
            masked_post = dict(post)
            if 'customer_input' in masked_post and 'card_num' in masked_post['customer_input']:
                masked_post['customer_input']['card_num'] = 'XXXX' + masked_post['customer_input']['card_num'][-4:]
            if 'customer_input' in masked_post and 'cvv' in masked_post['customer_input']:
                masked_post['customer_input']['cvv'] = 'XXX'
            _logger.info("Payment post data: %s", json.dumps(masked_post))
            
            # Create device information object with fingerprint
            device_information = Ptsv2paymentsDeviceInformation(
                fingerprint_session_id=device_fingerprint)
            
            # Prepare the request object
            request_params = {
                'client_reference_information': client_reference_information.__dict__,
                'processing_information': processing_information.__dict__,
                'payment_information': payment_information.__dict__,
                'order_information': order_information.__dict__,
                'device_information': device_information.__dict__
            }
            
            # Add consumer authentication information if using 3D Secure
            if use_3ds:
                consumer_authentication_information = Ptsv2paymentsConsumerAuthenticationInformation(
                    cavv="AAABCSIIAAAAAAACcwgAEMCoNh+=",
                    xid="T1Y0OVcxMVJJdkI0WFlBcXptUzE=")
                request_params['consumer_authentication_information'] = consumer_authentication_information.__dict__
                _logger.info("Including 3D Secure authentication information")
            
            # Create the request object
            request_obj = CreatePaymentRequest(**request_params)
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
                
                # Extract approval code from processor information
                approval_code = ""
                if 'processorInformation' in response_data and 'approvalCode' in response_data['processorInformation']:
                    approval_code = response_data['processorInformation']['approvalCode']
                    _logger.info("Extracted approval code from CyberSource response: %s", approval_code)
                
                # According to CyberSource API docs, HTTP 201 with status AUTHORIZED is a successful transaction
                if status == 201:
                    # Get CyberSource status
                    cybersource_status = response_data.get('status', '')
                    
                    # Map the status to the appropriate Odoo transaction state
                    if cybersource_status == 'AUTHORIZED':
                        transaction_state = 'done'
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
                        transaction_state = 'done'
                        _logger.info("Payment status: %s (mapped to done)", cybersource_status)
                    
                    # Try to find the transaction reference from payment link if applicable
                    transaction_reference = post.get('reference')
                    sale_order_id = None
                    if 'values' in post and 'sale_order_id' in post.get('values'):
                        sale_order_id = post.get('values').get('sale_order_id')
                    
                    # If we have a sale_order_id but no reference, try to find the transaction
                    if not transaction_reference and sale_order_id:
                        try:
                            # Look up transaction by sale_order_id with sudo
                            sale_order = request.env['sale.order'].sudo().browse(int(sale_order_id))
                            if sale_order and sale_order.exists():
                                # Get the associated transaction
                                transaction = request.env['payment.transaction'].sudo().search([
                                    ('sale_order_ids', 'in', sale_order.id),
                                ], limit=1)
                                if transaction:
                                    transaction_reference = transaction.reference
                                    _logger.info("Found transaction reference %s from sale order %s", 
                                                transaction_reference, sale_order_id)
                        except Exception as e:
                            _logger.warning("Could not access sale order %s: %s", sale_order_id, e)
                    
                    # Build the notification data
                    status_data = {
                        'reference': transaction_reference,
                        'payment_details': post.get('customer_input')['card_num'],
                        'simulated_state': transaction_state,
                        'cybersource_status': cybersource_status,
                        'manual_capture': False,
                        'device_fingerprint': device_fingerprint,
                        'message': response_data.get('message', ''),
                        'approval_code': approval_code  # Add approval code to notification data
                    }
                    
                    # Process the transaction with the data
                    request.env['payment.transaction'].sudo()._handle_notification_data(
                        'cybersource', status_data)
                    
                    return return_data
                else:
                    # Handle specific error cases
                    _logger.error("Payment request failed - HTTP Status: %s", status)
                    error_message = "Payment processing error"
                    
                    # Check if this is a 3D Secure requirement error
                    if status == 400 and 'consumerAuthenticationInformation.cavv' in body:
                        if not use_3ds:
                            _logger.info("3D Secure required, retrying with 3D Secure enabled")
                            # Retry with 3D Secure enabled
                            post['use_3ds'] = True
                            return self.payment_with_flex_token(**post)
                        else:
                            error_message = "3D Secure authentication failed"
                    elif 'message' in response_data:
                        error_message = response_data.get('message')
                        
                    raise ValidationError(_(error_message))
                    
            except Exception as e:
                # Check if this is a 3D Secure requirement error and we haven't tried yet
                if not use_3ds and "consumerAuthenticationInformation.cavv" in str(e):
                    _logger.info("3D Secure required, retrying with 3D Secure enabled")
                    post['use_3ds'] = True
                    return self.payment_with_flex_token(**post)
                else:
                    _logger.error("Exception when calling PaymentsApi->create_payment: %s", e)
                    raise ValidationError(_("Payment processing error: %s") % str(e))
                
        except Exception as e:
            _logger.error("General error in payment processing: %s", e)
            raise ValidationError(_("Payment processing error: %s") % str(e))

    def _get_cybersource_merchant_id(self):
        """Get the merchant ID from the payment provider configuration"""
        record = request.env['payment.provider'].sudo().search(
            [('code', '=', 'cybersource')], limit=1)
        return record.cyber_merchant if record else ""

    def get_configuration(self):
        """ This is used for Payment provider configuration """
        record = request.env['payment.provider'].sudo().search(
            [('code', '=', 'cybersource')])
        configuration_dictionary = {
            "authentication_type": "http_signature",
            "merchantid": record.cyber_merchant,
            "run_environment": "api.cybersource.com",  # Changed from apitest.cybersource.com to production URL
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