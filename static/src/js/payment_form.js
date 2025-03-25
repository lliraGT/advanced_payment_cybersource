/** @odoo-module */
import { _t } from "@web/core/l10n/translation";
import paymentForm from '@payment/js/payment_form';
import { jsonrpc } from "@web/core/network/rpc_service";

// Payment process with cybersource
paymentForm.include({
    /**
     * Get device fingerprint ID, ensuring it's numeric
     * @returns {String} The device fingerprint ID
     */
    _getDeviceFingerprint() {
        // Try from window variable first (set by device_fingerprint.js)
        if (window.cybersourceFingerprint) {
            return window.cybersourceFingerprint;
        }
        
        // Try from form field
        const fingerprintInput = document.getElementById('customer_device_fingerprint');
        if (fingerprintInput && fingerprintInput.value) {
            return fingerprintInput.value;
        }
        
        // Try from localStorage as fallback
        const storedFingerprint = localStorage.getItem('cybersource_device_fingerprint');
        if (storedFingerprint) {
            return storedFingerprint;
        }
        
        // Last resort - generate a new ID
        const numericId = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
        localStorage.setItem('cybersource_device_fingerprint', numericId);
        console.log('Generated new device fingerprint:', numericId);
        return numericId;
    },

    /**
     * Override to handle CyberSource redirect flow
     */
    _processRedirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'cybersource') {
            return this._super(...arguments);
        }
        
        // Extract form values
        const customerInputNumber = $('#customer_input_number').val();
        const customerInputName = $('#customer_input_name').val();
        const expMonth = $('#customer_input_month').val();
        const expYear = $('#customer_input_year').val();
        const cvv = $('#customer_input_cvv').val();
        
        // Get the device fingerprint ID
        const deviceFingerprint = this._getDeviceFingerprint();
        console.log("Processing payment with device fingerprint:", deviceFingerprint);
        
        // Form validation
        if(!customerInputNumber) {
            this._displayErrorDialog(
                _t("Validation Error"),
                _t("Please enter your card number")
            );
            return;
        }
        
        if(!expMonth || !expYear) {
            this._displayErrorDialog(
                _t("Validation Error"),
                _t("Please enter card expiration date")
            );
            return;
        }
        
        if(!cvv) {
            this._displayErrorDialog(
                _t("Validation Error"),
                _t("Please enter card security code (CVV)")
            );
            return;
        }
        
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
                'values': {
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
                _t("An error occurred while processing your payment. Please try again.")
            );
        });
    },
});