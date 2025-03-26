/* Standalone CyberSource device fingerprint integration */
(function() {
    // Run when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        setupDeviceFingerprint();
    });
    
    // Fallback for jQuery ready
    if (typeof jQuery !== 'undefined') {
        jQuery(document).ready(function() {
            setupDeviceFingerprint();
        });
    }
    
    function setupDeviceFingerprint() {
        // Check if we're on a payment page or payment link page
        const isPaymentPage = window.location.pathname.includes('/shop/payment') || 
                              window.location.pathname.includes('/payment/pay');
        
        if (!isPaymentPage) {
            return; // Exit if not on a payment page
        }
        
        // Find existing container or create one for payment links
        var container = document.getElementById('cybersource_df_container');
        if (!container) {
            // Create container for payment links
            container = document.createElement('div');
            container.id = 'cybersource_df_container';
            container.className = 'd-none';
            
            // Find a good place to insert the container in payment link page
            const paymentForm = document.querySelector('form.o_payment_form, form.payment_form, #o_payment_form');
            if (paymentForm) {
                // Insert before the form
                paymentForm.parentNode.insertBefore(container, paymentForm);
            } else {
                // Fallback to body if form not found
                document.body.appendChild(container);
            }
        }
        
        // Generate fingerprint
        var fingerprint = generateFingerprint();
        
        // Try to fetch the merchant ID using AJAX
        fetchMerchantId(function(merchantId) {
            // Default merchant ID if fetch fails
            merchantId = merchantId || 'visanetgt_kani';
            
            // Create session ID (merchantID + fingerprint)
            var sessionId = merchantId + fingerprint;
            
            // Test environment org_id (1snn5n9w for test, k8vif92e for production)
            var orgId = '1snn5n9w';
            
            // Add script to head (as required in PDF)
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://h.online-metrix.net/fp/tags.js?org_id=' + orgId + '&session_id=' + sessionId;
            document.head.appendChild(script);
            
            // Add iframe inside noscript tag (as required in PDF)
            container.innerHTML = 
                '<noscript>' +
                '<iframe style="width: 100px; height: 100px; border: 0; position: absolute; top: -5000px;" ' +
                'src="https://h.online-metrix.net/fp/tags?org_id=' + orgId + '&session_id=' + sessionId + '">' +
                '</iframe>' +
                '</noscript>';
            
            // Show container
            container.style.display = 'block';
            
            console.log('CyberSource device fingerprint initialized: ' + fingerprint);
            console.log('Session ID: ' + sessionId);
        });
    }
    
    function fetchMerchantId(callback) {
        // Try to get the merchant ID from the server
        if (window.odoo && window.odoo.jsonrpc) {
            window.odoo.jsonrpc('/payment/cybersource/get_merchant_id', 'call', {})
                .then(function(result) {
                    callback(result);
                })
                .catch(function(error) {
                    console.error('Error fetching merchant ID:', error);
                    callback(null);
                });
        } else if (window.fetch) {
            // Fallback to fetch API if odoo.jsonrpc is not available
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
                callback(data.result);
            })
            .catch(error => {
                console.error('Error fetching merchant ID:', error);
                callback(null);
            });
        } else {
            // If none of the above methods are available
            callback(null);
        }
    }
    
    function generateFingerprint() {
        // Try to get the order reference from the page
        var orderReference = findOrderReference();
        var fingerprint;
        
        if (orderReference) {
            // Extract numeric part if it starts with S
            var numericPart = orderReference;
            if (orderReference.startsWith('S')) {
                numericPart = orderReference.substring(1);
            }
            
            // Add date prefix YYMMDD
            var date = new Date();
            var datePrefix = 
                String(date.getFullYear()).substring(2) + 
                String(date.getMonth() + 1).padStart(2, '0') + 
                String(date.getDate()).padStart(2, '0');
            
            // Combine date + order ID, ensure it's at least 10 digits
            fingerprint = datePrefix + numericPart;
            // Truncate if longer than 10 digits
            if (fingerprint.length > 10) {
                fingerprint = fingerprint.substring(0, 10);
            }
            // Pad with zeros if shorter than 10 digits
            while (fingerprint.length < 10) {
                fingerprint = fingerprint + '0';
            }
        } else {
            // Fallback to date + random if no order reference found
            var date = new Date();
            var datePart = 
                String(date.getFullYear()).substring(2) + 
                String(date.getMonth() + 1).padStart(2, '0') + 
                String(date.getDate()).padStart(2, '0');
            
            var randomPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            fingerprint = datePart + randomPart;
        }
        
        // Store in window for form access
        window.cybersourceFingerprint = fingerprint;
        
        // Update any hidden fields
        var fields = document.querySelectorAll('[name="device_fingerprint"], #customer_device_fingerprint');
        for (var i = 0; i < fields.length; i++) {
            fields[i].value = fingerprint;
        }
        
        // Also add a hidden field to the payment form for payment links
        addHiddenFingerprintField(fingerprint);
        
        return fingerprint;
    }
    
    function addHiddenFingerprintField(fingerprint) {
        // For payment links, add the fingerprint to the payment form
        const forms = document.querySelectorAll('form.o_payment_form, form.payment_form, #o_payment_form');
        forms.forEach(form => {
            // Check if field already exists
            let field = form.querySelector('[name="device_fingerprint"], #customer_device_fingerprint');
            if (!field) {
                // Create new hidden field
                field = document.createElement('input');
                field.type = 'hidden';
                field.name = 'device_fingerprint';
                field.id = 'customer_device_fingerprint';
                form.appendChild(field);
            }
            field.value = fingerprint;
        });
    }
    
    function findOrderReference() {
        // Try different methods to find order reference
        
        // Method 1: Look for an element containing the reference in specific places
        var referenceEl = document.querySelector('.reference');
        if (referenceEl && referenceEl.textContent) {
            return referenceEl.textContent.trim();
        }
        
        // Method 2: Try to extract from URL if present
        var urlMatch = window.location.pathname.match(/\/orders\/([^\/]+)/);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
        
        // Method 3: Look for hidden input with reference
        var refInput = document.querySelector('input[name="reference"]');
        if (refInput && refInput.value) {
            return refInput.value;
        }
        
        // Method 4: Look for specific data in payment form
        var paymentForm = document.querySelector('form.payment_form, form.o_payment_form');
        if (paymentForm) {
            var txEl = paymentForm.querySelector('[data-reference]');
            if (txEl && txEl.dataset.reference) {
                return txEl.dataset.reference;
            }
        }
        
        // Method 5: Check URL parameters
        var urlParams = new URLSearchParams(window.location.search);
        var refParam = urlParams.get('reference');
        if (refParam) {
            return refParam;
        }
        
        // Method 6: Look for sale_order_id in URL (for payment links)
        var orderParam = urlParams.get('sale_order_id');
        if (orderParam) {
            return 'SO' + orderParam;
        }
        
        // Method 7: Try to get the payment transaction reference
        if (typeof odoo !== 'undefined' && odoo.session_info && odoo.session_info.sale_order) {
            return odoo.session_info.sale_order.name;
        }
        
        return null;
    }
})();