/* Payment Link Handler for CyberSource Device Fingerprinting */
(function() {
    // Run on DOM ready
    document.addEventListener('DOMContentLoaded', function() {
        initPaymentLinkFingerprint();
    });
    
    /**
     * Initialize fingerprinting specifically for payment link pages
     */
    function initPaymentLinkFingerprint() {
        // Only run on payment link pages
        if (!window.location.pathname.includes('/payment/pay')) {
            return;
        }
        
        console.log('Initializing CyberSource fingerprinting for payment link');
        
        // Create container if it doesn't exist
        let container = document.getElementById('cybersource_df_container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'cybersource_df_container';
            container.className = 'd-none';
            
            // Find payment form - note: different selectors for payment link pages
            const paymentForm = document.querySelector('.o_payment_form, #payment_method, form[name="o_payment"]');
            if (paymentForm) {
                paymentForm.parentNode.insertBefore(container, paymentForm);
            } else {
                // Fallback to body
                document.body.appendChild(container);
            }
        }
        
        // Get parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        const saleOrderId = urlParams.get('sale_order_id');
        
        // Generate fingerprint and save to form
        generateFingerprint(saleOrderId);
        
        // Add listener for form submission
        addPaymentFormListeners();
    }
    
    /**
     * Generate a device fingerprint
     * @param {string} saleOrderId - The sale order ID if available
     */
    function generateFingerprint(saleOrderId) {
        let fingerprint;
        
        if (saleOrderId) {
            // Format date YYMMDD
            const date = new Date();
            const datePrefix = 
                String(date.getFullYear()).substring(2) + 
                String(date.getMonth() + 1).padStart(2, '0') + 
                String(date.getDate()).padStart(2, '0');
            
            // Combine date + order ID, ensure it's at least 10 digits
            fingerprint = datePrefix + saleOrderId;
            // Truncate if longer than 10 digits
            if (fingerprint.length > 10) {
                fingerprint = fingerprint.substring(0, 10);
            }
            // Pad with zeros if shorter than 10 digits
            while (fingerprint.length < 10) {
                fingerprint = fingerprint + '0';
            }
        } else {
            // Fallback to date + random
            const date = new Date();
            const datePart = 
                String(date.getFullYear()).substring(2) + 
                String(date.getMonth() + 1).padStart(2, '0') + 
                String(date.getDate()).padStart(2, '0');
            
            const randomPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            fingerprint = datePart + randomPart;
        }
        
        // Store the fingerprint
        window.cybersourceFingerprint = fingerprint;
        localStorage.setItem('cybersource_device_fingerprint', fingerprint);
        
        console.log('Generated CyberSource fingerprint:', fingerprint);
        
        // Add to payment form
        addFingerprintToForm(fingerprint);
        
        // Add device fingerprint script
        addDeviceFingerprintScript(fingerprint);
    }
    
    /**
     * Add the fingerprint to any payment forms
     * @param {string} fingerprint - The fingerprint to add
     */
    function addFingerprintToForm(fingerprint) {
        // Add to any forms on the page
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            // Check if form already has the field
            let field = form.querySelector('[name="device_fingerprint"], #customer_device_fingerprint');
            if (!field) {
                // Create new field
                field = document.createElement('input');
                field.type = 'hidden';
                field.name = 'device_fingerprint';
                field.id = 'customer_device_fingerprint';
                form.appendChild(field);
            }
            field.value = fingerprint;
        });
    }
    
    /**
     * Add listeners to payment form for Cybersource selection
     */
    function addPaymentFormListeners() {
        // Find all payment options with a small delay to ensure they're loaded
        setTimeout(function() {
            // Payment link pages use different selectors for payment options
            const radioButtons = document.querySelectorAll('input[name="o_payment_radio"], input[name="acquirer_id"], input[type="radio"][data-provider]');
            
            radioButtons.forEach(radio => {
                // Add listener for change events
                radio.addEventListener('change', function() {
                    // Check if this is a CyberSource option
                    const isCS = 
                        (this.dataset && this.dataset.provider === 'cybersource') || 
                        (this.getAttribute('data-provider-code') === 'cybersource');
                    
                    if (this.checked && isCS) {
                        console.log('CyberSource payment method selected');
                        // Ensure fingerprint is properly loaded
                        if (window.cybersourceFingerprint) {
                            console.log('Using fingerprint:', window.cybersourceFingerprint);
                        } else {
                            // Generate new fingerprint
                            const urlParams = new URLSearchParams(window.location.search);
                            const saleOrderId = urlParams.get('sale_order_id');
                            generateFingerprint(saleOrderId);
                        }
                    }
                });
                
                // Check if already selected
                const isCS = 
                    (radio.dataset && radio.dataset.provider === 'cybersource') || 
                    (radio.getAttribute('data-provider-code') === 'cybersource');
                
                if (radio.checked && isCS) {
                    console.log('CyberSource payment method already selected');
                }
            });
        }, 500);
    }
    
    /**
     * Add the device fingerprint script
     * @param {string} fingerprint - The fingerprint to use
     */
    function addDeviceFingerprintScript(fingerprint) {
        // Use fetch API to get merchant ID
        fetch('/payment/cybersource/get_merchant_id', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {},
            }),
        })
        .then(response => response.json())
        .then(data => {
            const merchantId = data.result || 'visanetgt_kani';
            
            // Create session ID (merchantID + fingerprint)
            const sessionId = merchantId + fingerprint;
            
            // Test environment org_id
            const orgId = '1snn5n9w';
            
            // Add script to head
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://h.online-metrix.net/fp/tags.js?org_id=' + orgId + '&session_id=' + sessionId;
            document.head.appendChild(script);
            
            // Add iframe to container
            const container = document.getElementById('cybersource_df_container');
            if (container) {
                container.innerHTML = 
                    '<noscript>' +
                    '<iframe style="width: 100px; height: 100px; border: 0; position: absolute; top: -5000px;" ' +
                    'src="https://h.online-metrix.net/fp/tags?org_id=' + orgId + '&session_id=' + sessionId + '">' +
                    '</iframe>' +
                    '</noscript>';
                
                container.style.display = 'block';
                
                console.log('Added CyberSource device fingerprint script with session ID:', sessionId);
            }
        })
        .catch(error => {
            console.error('Error fetching merchant ID:', error);
            // Fallback to a default value
            const merchantId = 'visanetgt_kani';
            const sessionId = merchantId + fingerprint;
            const orgId = '1snn5n9w';
            
            // Add script with default values
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://h.online-metrix.net/fp/tags.js?org_id=' + orgId + '&session_id=' + sessionId;
            document.head.appendChild(script);
            
            console.log('Added CyberSource device fingerprint script with default merchant ID');
        });
    }
})();