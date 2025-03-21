/** @odoo-module */
import { _t } from "@web/core/l10n/translation";
import paymentForm from '@payment/js/payment_form';
import { Dialog } from "@web/core/dialog/dialog";
import { jsonrpc } from "@web/core/network/rpc_service";

// Payment process with cybersource
paymentForm.include({
    /**
     * Get device fingerprint ID from the hidden field
     * @returns {string} - Device fingerprint ID or empty string
     */
    _getDeviceFingerprint() {
        const deviceFingerprintInput = document.getElementById('device_fingerprint');
        return deviceFingerprintInput ? deviceFingerprintInput.value : '';
    },

    _processRedirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'cybersource') {
            return this._super(...arguments);
        }
        
        var customerInputNumber = $('#customer_input_number').val();
        const customerInputName = $('#customer_input_name').val();
        const expMonth = $('#customer_input_month').val();
        const expYear = $('#customer_input_year').val();
        const cvv = $('#customer_input_cvv').val();
        
        // Get the device fingerprint ID
        const deviceFingerprint = this._getDeviceFingerprint();
        
        var self = this;
        let currentDate = new Date();
        let previousMonth = new Date();
        previousMonth.setMonth(currentDate.getMonth() - 1);
        
        // Form validation
        if(customerInputNumber == "") {
            this._displayErrorDialog(
                _t("Server Error"),
                _t("We are not able to process your payment Card Number not entered")
            );
        }
        // Display error if card is expired
        else if (expYear <= previousMonth.getFullYear() && currentDate.getMonth() <= previousMonth.getMonth()) {
            var self = this;
            self._displayErrorDialog(
                _t("Server Error"),
                _t("We are not able to process your payment. Expiry year is not valid")
            );
        }
        // Display error if card expiry month is not a valid one
        else if(expMonth == 0) {
            var self = this;
            self._displayErrorDialog(
                _t("Server Error"),
                _t("We are not able to process your payment. Expiry month not valid.")
            );
        }
        // Display error if CVV is missing
        else if(!cvv || cvv === "") {
            self._displayErrorDialog(
                _t("Server Error"),
                _t("We are not able to process your payment. Security code (CVV) is required.")
            );
        }
        // If details are correct process the payment
        else {
            console.log("Processing payment with device fingerprint:", deviceFingerprint);
            
            return jsonrpc(
                '/payment/cybersource/simulate_payment',
                {
                    'reference': processingValues.reference,
                    'customer_input': {
                        'exp_year': expYear,
                        'exp_month': expMonth,
                        'name': customerInputName,
                        'card_num': customerInputNumber,
                        'cvv': cvv,
                        'device_fingerprint': deviceFingerprint
                    },
                    'values':{
                        'amount': processingValues.amount,
                        'currency': processingValues.currency_id,
                        'partner': processingValues.partner_id,
                        'order': processingValues.reference
                    },
                },
           ).then(() => window.location = '/payment/status')
           .catch(error => {
               console.error("Payment processing error:", error);
               this._displayErrorDialog(
                   _t("Payment Error"),
                   _t("An error occurred while processing your payment: ") + (error.message || "Unknown error")
               );
           });
        }
    },
});