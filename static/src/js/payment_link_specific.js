/* IMMEDIATE EXECUTION - Specifically for Payment Links */
(function() {
    // Check if this is a payment link page
    if (window.location.pathname.includes('/payment/pay')) {
        console.log('CYBERSOURCE: Payment link detected');
        loadDeviceFingerprint();
    }
    
    function loadDeviceFingerprint() {
        // Get sale order ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const saleOrderId = urlParams.get('sale_order_id');
        
        // Generate timestamp-based fingerprint
        const now = new Date();
        const dateStr = String(now.getFullYear()).substring(2) + 
                        String(now.getMonth() + 1).padStart(2, '0') + 
                        String(now.getDate()).padStart(2, '0');
        
        let fingerprint = dateStr;
        if (saleOrderId) {
            fingerprint += saleOrderId;
        } else {
            // Use milliseconds if no order ID
            fingerprint += String(Date.now()).substring(5, 10);
        }
        
        // Ensure exactly 10 chars
        fingerprint = fingerprint.substring(0, 10).padEnd(10, '0');
        
        // Default merchant ID (will be replaced if possible)
        let merchantId = 'visanetgt_kani';
        
        // Try to fetch real merchant ID, but don't wait for it
        fetch('/payment/cybersource/get_merchant_id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {}
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.result) {
                merchantId = data.result;
                injectScript(merchantId, fingerprint);
            }
        })
        .catch(() => {
            // Use default on error
            injectScript(merchantId, fingerprint);
        });
        
        // Don't wait for fetch, use default immediately
        injectScript(merchantId, fingerprint);
        
        // Store fingerprint globally
        window.cybersourceFingerprint = fingerprint;
        console.log('CYBERSOURCE: Generated fingerprint:', fingerprint);
        
        // Add to any forms present/future
        document.addEventListener('DOMContentLoaded', function() {
            attachToForms(fingerprint);
            
            // Also watch for dynamically added forms
            const observer = new MutationObserver(function(mutations) {
                for (let mutation of mutations) {
                    for (let node of mutation.addedNodes) {
                        if (node.tagName === 'FORM') {
                            addToForm(node, fingerprint);
                        } else if (node.querySelectorAll) {
                            const forms = node.querySelectorAll('form');
                            for (let form of forms) {
                                addToForm(form, fingerprint);
                            }
                        }
                    }
                }
            });
            
            observer.observe(document.body, { 
                childList: true, 
                subtree: true 
            });
        });
    }
    
    function injectScript(merchantId, fingerprint) {
        // Create and inject the script tag
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://h.online-metrix.net/fp/tags.js?org_id=1snn5n9w&session_id=' + 
                     merchantId + fingerprint;
        document.head.appendChild(script);
        
        console.log('CYBERSOURCE: Injected fingerprint script with session ID:', merchantId + fingerprint);
        
        // Create container for iframe
        const container = document.createElement('div');
        container.id = 'cybersource_df_container';
        container.style.display = 'none';
        
        // Create iframe for noscript fallback
        const iframe = document.createElement('iframe');
        iframe.style.width = '100px';
        iframe.style.height = '100px';
        iframe.style.border = '0';
        iframe.style.position = 'absolute';
        iframe.style.top = '-5000px';
        iframe.src = 'https://h.online-metrix.net/fp/tags?org_id=1snn5n9w&session_id=' + 
                     merchantId + fingerprint;
        
        // Add to container
        container.appendChild(iframe);
        
        // Add to body if it exists, otherwise wait for it
        if (document.body) {
            document.body.appendChild(container);
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.body.appendChild(container);
            });
        }
    }
    
    function attachToForms(fingerprint) {
        const forms = document.querySelectorAll('form');
        for (let form of forms) {
            addToForm(form, fingerprint);
        }
    }
    
    function addToForm(form, fingerprint) {
        let field = form.querySelector('[name="device_fingerprint"], #customer_device_fingerprint');
        if (!field) {
            field = document.createElement('input');
            field.type = 'hidden';
            field.name = 'device_fingerprint';
            field.id = 'customer_device_fingerprint';
            form.appendChild(field);
        }
        field.value = fingerprint;
    }
})();