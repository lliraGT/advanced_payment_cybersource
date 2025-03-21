/** @odoo-module */

import publicWidget from 'web.public.widget';

publicWidget.registry.CyberSourceDeviceFingerprint = publicWidget.Widget.extend({
    selector: '.oe_website_sale_payment',
    
    /**
     * @override
     */
    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            self._initDeviceFingerprint();
        });
    },
    
    /**
     * Initialize device fingerprint by adding the required script and noscript tags
     * @private
     */
    _initDeviceFingerprint: function () {
        const orderId = this._getOrderReference();
        const merchantId = this._getMerchantId();
        const sessionId = merchantId + orderId;
        
        // Set hidden input with fingerprint ID for form submission
        const fingerprintId = orderId;
        this._setDeviceFingerprint(fingerprintId);
        
        // Add script to head
        const orgId = this._getOrgId();
        const scriptSrc = `https://h.online-metrix.net/fp/tags.js?org_id=${orgId}&session_id=${sessionId}`;
        this._addFingerPrintScript(scriptSrc);
        
        // Add noscript iframe to body
        const iframeSrc = `https://h.online-metrix.net/fp/tags?org_id=${orgId}&session_id=${sessionId}`;
        this._addFingerPrintIframe(iframeSrc);
    },
    
    /**
     * Get the order reference to use as identifier
     * @private
     * @returns {string} - Order reference or random ID
     */
    _getOrderReference: function () {
        // Try to get the order reference from the page
        const $orderReference = $('.oe_website_sale_tx_id');
        if ($orderReference.length) {
            return $orderReference.val() || this._generateId();
        }
        return this._generateId();
    },
    
    /**
     * Generate a random ID if order reference isn't available
     * @private
     * @returns {string} - Random ID
     */
    _generateId: function () {
        return Math.floor(Math.random() * 1000000000).toString();
    },
    
    /**
     * Get CyberSource merchant ID
     * @private
     * @returns {string} - Merchant ID
     */
    _getMerchantId: function () {
        // Get from data attribute or use a default for testing
        const $form = $('.payment_method_form[data-provider="cybersource"]');
        return $form.data('merchant-id') || 'visanetgt_kani';
    },
    
    /**
     * Get org ID based on environment (test or production)
     * @private
     * @returns {string} - Org ID
     */
    _getOrgId: function () {
        // Check if we're in production or test environment
        const $form = $('.payment_method_form[data-provider="cybersource"]');
        const isProduction = $form.data('environment') === 'prod';
        
        // Use appropriate org_id based on environment
        return isProduction ? 'k8vif92e' : '1snn5n9w';
    },
    
    /**
     * Add the fingerprint script to the head
     * @private
     * @param {string} src - Script source URL
     */
    _addFingerPrintScript: function (src) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = src;
        document.head.appendChild(script);
    },
    
    /**
     * Add the fingerprint iframe to the body
     * @private
     * @param {string} src - Iframe source URL
     */
    _addFingerPrintIframe: function (src) {
        const noscript = document.createElement('noscript');
        const iframe = document.createElement('iframe');
        
        iframe.style = 'width: 100px; height: 100px; border: 0; position:absolute; top: -5000px;';
        iframe.src = src;
        
        noscript.appendChild(iframe);
        document.body.appendChild(noscript);
    },
    
    /**
     * Set the device fingerprint ID in a hidden input field for form submission
     * @private
     * @param {string} fingerprintId - The device fingerprint ID
     */
    _setDeviceFingerprint: function (fingerprintId) {
        // Check if input already exists
        let $fingerprintInput = $('input[name="device_fingerprint"]');
        
        if (!$fingerprintInput.length) {
            // Create hidden input if it doesn't exist
            $fingerprintInput = $('<input>', {
                type: 'hidden',
                name: 'device_fingerprint',
                id: 'device_fingerprint'
            });
            
            // Add to payment form
            const $paymentForm = $('.payment_method_form[data-provider="cybersource"]');
            if ($paymentForm.length) {
                $paymentForm.append($fingerprintInput);
            } else {
                // Fallback - add to any payment form
                $('.payment_method_form:first').append($fingerprintInput);
            }
        }
        
        // Set the fingerprint ID
        $fingerprintInput.val(fingerprintId);
    }
});

export default publicWidget.registry.CyberSourceDeviceFingerprint;