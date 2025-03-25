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
        // Find container
        var container = document.getElementById('cybersource_df_container');
        if (!container) return;
        
        // Generate fingerprint
        var fingerprint = generateFingerprint();
        
        // Default merchant ID
        var merchantId = 'visanetgt_kani';
        
        // Check for merchant ID in form
        var merchantField = document.querySelector('[name="merchant_id"]');
        if (merchantField && merchantField.value) {
            merchantId = merchantField.value;
        }
        
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
        
        console.log('CyberSource device fingerprint: ' + fingerprint);
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
        
        return fingerprint;
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
        
        // Method 6: Try to get the payment transaction reference
        if (typeof odoo !== 'undefined' && odoo.session_info && odoo.session_info.sale_order) {
            return odoo.session_info.sale_order.name;
        }
        
        return null;
    }
})();