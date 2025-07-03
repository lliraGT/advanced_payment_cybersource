/* Consolidated CyberSource Device Fingerprint - Prevents Multiple Loading */
(function() {
    // Prevent multiple executions
    if (window.cybersourceInitialized) {
        console.log('CyberSource already initialized, skipping');
        return;
    }
    window.cybersourceInitialized = true;
    
    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCyberSource);
    } else {
        initializeCyberSource();
    }
    
    function initializeCyberSource() {
        // Check if we're on a payment page or payment link page
        const isPaymentPage = window.location.pathname.includes('/shop/payment') || 
                              window.location.pathname.includes('/payment/pay') ||
                              window.location.pathname.includes('/my/orders/');
        
        if (!isPaymentPage) {
            console.log('Not on payment page, skipping CyberSource initialization');
            return;
        }
        
        console.log('Initializing CyberSource device fingerprinting');
        
        // Create container if it doesn't exist
        let container = document.getElementById('cybersource_df_container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'cybersource_df_container';
            container.className = 'd-none';
            container.style.display = 'none';
            
            // Find a good place to insert the container
            const paymentForm = document.querySelector('form.o_payment_form, form.payment_form, #o_payment_form, .o_payment_form');
            if (paymentForm) {
                paymentForm.parentNode.insertBefore(container, paymentForm);
            } else {
                document.body.appendChild(container);
            }
        }
        
        // Generate fingerprint
        const fingerprint = generateFingerprint();
        console.log('Generated CyberSource fingerprint:', fingerprint);
        
        // Store fingerprint globally
        window.cybersourceFingerprint = fingerprint;
        
        // Add to localStorage if available
        try {
            localStorage.setItem('cybersource_device_fingerprint', fingerprint);
        } catch(e) {
            console.warn('Could not store fingerprint in localStorage:', e);
        }
        
        // Add to any existing forms
        addToAllForms(fingerprint);
        
        // Watch for new forms being added
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'FORM') {
                            addToForm(node, fingerprint);
                        } else if (node.querySelectorAll) {
                            const forms = node.querySelectorAll('form');
                            forms.forEach(form => addToForm(form, fingerprint));
                        }
                    }
                });
            });
        });
        
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Load the CyberSource script
        loadCyberSourceScript(fingerprint);
    }
    
    function generateFingerprint() {
        // Check if already generated
        if (window.cybersourceFingerprint) {
            return window.cybersourceFingerprint;
        }
        
        // Try to get order reference from various sources
        const orderReference = findOrderReference();
        let fingerprint;
        
        // Generate date prefix YYMMDD
        const date = new Date();
        const datePrefix = 
            String(date.getFullYear()).substring(2) + 
            String(date.getMonth() + 1).padStart(2, '0') + 
            String(date.getDate()).padStart(2, '0');
        
        if (orderReference) {
            // Extract numeric part if it starts with S
            let numericPart = orderReference;
            if (orderReference.startsWith('S')) {
                numericPart = orderReference.substring(1);
            }
            
            // Combine date + order ID
            fingerprint = datePrefix + numericPart;
        } else {
            // Fallback to date + random
            const randomPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            fingerprint = datePrefix + randomPart;
        }
        
        // Ensure exactly 10 characters
        if (fingerprint.length > 10) {
            fingerprint = fingerprint.substring(0, 10);
        } else {
            fingerprint = fingerprint.padEnd(10, '0');
        }
        
        return fingerprint;
    }
    
    function findOrderReference() {
        // Method 1: URL pattern matching
        const urlMatch = window.location.pathname.match(/\/orders\/(\d+)/);
        if (urlMatch && urlMatch[1]) {
            return 'S' + urlMatch[1];
        }
        
        // Method 2: URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const saleOrderId = urlParams.get('sale_order_id');
        if (saleOrderId) {
            return 'S' + saleOrderId;
        }
        
        // Method 3: Look for reference in DOM
        const referenceEl = document.querySelector('.reference, [data-reference]');
        if (referenceEl) {
            return referenceEl.textContent?.trim() || referenceEl.dataset.reference;
        }
        
        // Method 4: Hidden input
        const refInput = document.querySelector('input[name="reference"]');
        if (refInput && refInput.value) {
            return refInput.value;
        }
        
        return null;
    }
    
    function addToAllForms(fingerprint) {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => addToForm(form, fingerprint));
    }
    
    function addToForm(form, fingerprint) {
        // Check if field already exists by name first, then by ID
        let field = form.querySelector('[name="device_fingerprint"]');
        if (!field) {
            // Check if there's an existing field with the ID (avoid duplicates)
            field = document.getElementById('customer_device_fingerprint');
            if (field && !form.contains(field)) {
                // Field exists but not in this form, create a new one with unique ID
                field = document.createElement('input');
                field.type = 'hidden';
                field.name = 'device_fingerprint';
                // Create unique ID to avoid conflicts
                field.id = 'customer_device_fingerprint_' + Math.random().toString(36).substr(2, 9);
                form.appendChild(field);
            } else if (!field) {
                // No field exists, create new one
                field = document.createElement('input');
                field.type = 'hidden';
                field.name = 'device_fingerprint';
                field.id = 'customer_device_fingerprint';
                form.appendChild(field);
            }
        }
        if (field) {
            field.value = fingerprint;
        }
    }
    
    function loadCyberSourceScript(fingerprint) {
        // Check if script already loaded
        if (document.querySelector('script[src*="h.online-metrix.net/fp/tags.js"]')) {
            console.log('CyberSource script already loaded');
            return;
        }
        
        // Fetch merchant ID and load script
        fetchMerchantId(function(merchantId) {
            merchantId = merchantId || 'visanetgt_kani';
            const sessionId = merchantId + fingerprint;
            
            // Determine organization ID based on environment
            // k8vif92e = production environment
            // 1snn5n9w = test environment
            const orgId = getOrganizationId();
            
            // Add script tag
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = `https://h.online-metrix.net/fp/tags.js?org_id=${orgId}&session_id=${sessionId}`;
            script.onload = function() {
                console.log('CyberSource script loaded successfully');
            };
            script.onerror = function() {
                console.error('Failed to load CyberSource script');
            };
            document.head.appendChild(script);
            
            // Add iframe for noscript fallback
            const container = document.getElementById('cybersource_df_container');
            if (container) {
                container.innerHTML = 
                    `<noscript>
                        <iframe style="width: 100px; height: 100px; border: 0; position: absolute; top: -5000px;" 
                                src="https://h.online-metrix.net/fp/tags?org_id=${orgId}&session_id=${sessionId}">
                        </iframe>
                    </noscript>`;
                container.style.display = 'block';
            }
            
            console.log('CyberSource device fingerprint initialized with session ID:', sessionId);
        });
    }
    
    function fetchMerchantId(callback) {
        // Try different methods to get merchant ID
        if (window.odoo && window.odoo.jsonrpc) {
            window.odoo.jsonrpc('/payment/cybersource/get_merchant_id', 'call', {})
                .then(callback)
                .catch(() => callback(null));
        } else if (window.fetch) {
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
            .then(data => callback(data.result))
            .catch(() => callback(null));
        } else {
            callback(null);
        }
    }
    
    function getOrganizationId() {
        // Determine environment based on hostname or other criteria
        const hostname = window.location.hostname;
        
        // Production environments - use production org_id
        if (hostname.includes('production') || 
            hostname.includes('live') || 
            hostname.includes('www') ||
            !hostname.includes('test') && !hostname.includes('staging') && !hostname.includes('dev')) {
            console.log('Using production CyberSource org_id: k8vif92e');
            return 'k8vif92e'; // Production environment
        } else {
            console.log('Using test CyberSource org_id: 1snn5n9w');
            return '1snn5n9w'; // Test environment
        }
        
        // Alternative: You can also check by merchant ID or other config
        // if (merchantId === 'your_production_merchant_id') {
        //     return 'k8vif92e';
        // } else {
        //     return '1snn5n9w';
        // }
    }
})();