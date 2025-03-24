/** @odoo-module */
import { _t } from "@web/core/l10n/translation";
import paymentForm from '@payment/js/payment_form';
import { jsonrpc } from "@web/core/network/rpc_service";

// Payment process with cybersource
paymentForm.include({
    /**
     * Get device fingerprint ID, ensuring it's numeric
     */
    _getDeviceFingerprint() {
        // Try from window variable first
        if (window.cybersourceFingerprint) {
            return window.cybersourceFingerprint;
        }
        
        // Try from localStorage
        const storedFingerprint = localStorage.getItem('cybersource_device_fingerprint');
        if (storedFingerprint) {
            // If stored fingerprint is not numeric, convert it
            if (!/^\d+$/.test(storedFingerprint)) {
                // Create a numeric ID
                const numericId = Math.floor(Date.now() / 100).toString().slice(-10);
                localStorage.setItem('cybersource_device_fingerprint', numericId);
                console.log('Converted to numeric fingerprint:', numericId);
                return numericId;
            }
            return storedFingerprint;
        }
        
        // If nothing found, generate a new numeric ID
        const numericId = Math.floor(Date.now() / 100).toString().slice(-10);
        localStorage.setItem('cybersource_device_fingerprint', numericId);
        console.log('Generated new numeric fingerprint:', numericId);
        return numericId;
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
        console.log("Processing payment with device fingerprint:", deviceFingerprint);
        
        // Form validation
        if(customerInputNumber == "") {
            this._displayErrorDialog(
                _t("Server Error"),
                _t("We are not able to process your payment Card Number not entered")
            );
            return;
        }
        
        // Additional validation...
        // [rest of validation code omitted for brevity]
        
        // Process the payment
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
    },
});