/* Immediate Execution CyberSource Fingerprinting Script */
(function() {
    // Execute immediately - as early as possible during page load
    console.log("CyberSource early injection executing");
    
    // Check if we're on a payment link page
    if (window.location.pathname.includes('/payment/pay')) {
        console.log("Payment link detected - injecting CyberSource fingerprinting");
        injectNow();
    }
    
    /**
     * Inject the fingerprinting script immediately
     */
    function injectNow() {
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const saleOrderId = urlParams.get('sale_order_id');
        
        // Generate fingerprint
        const fingerprint = generateFingerprint(saleOrderId);
        console.log("Generated fingerprint:", fingerprint);
        
        // Store globally
        window.cybersourceFingerprint = fingerprint;
        
        // Use a hard-coded merchant ID to ensure immediate loading
        // This will be updated later once we can fetch the real one
        const merchantId = 'visanetgt_kani';
        const sessionId = merchantId + fingerprint;
        
        // Test environment org_id
        const orgId = '1snn5n9w';
        
        // Inject script tag immediately
        const scriptTag = document.createElement('script');
        scriptTag.type = 'text/javascript';
        scriptTag.async = false; // Load synchronously
        scriptTag.src = 'https://h.online-metrix.net/fp/tags.js?org_id=' + orgId + '&session_id=' + sessionId;
        
        // Add to head immediately if it exists, otherwise wait for it
        if (document.head) {
            document.head.appendChild(scriptTag);
            console.log("CyberSource script injected into head");
        } else {
            // Create a polling function to check for head
            const checkForHead = setInterval(function() {
                if (document.head) {
                    clearInterval(checkForHead);
                    document.head.appendChild(scriptTag);
                    console.log("CyberSource script injected into head (delayed)");
                }
            }, 5);
        }
    }
    
    /**
     * Generate a fingerprint based on timestamp and sale order ID
     */
    function generateFingerprint(saleOrderId) {
        // Format date YYMMDD
        const date = new Date();
        const dateStr = 
            String(date.getFullYear()).substring(2) + 
            String(date.getMonth() + 1).padStart(2, '0') + 
            String(date.getDate()).padStart(2, '0');
        
        let fingerprint;
        
        if (saleOrderId) {
            // Use sale order ID if available
            fingerprint = dateStr + saleOrderId;
        } else {
            // Use timestamp as fallback
            const timestamp = Date.now().toString().substring(7);
            fingerprint = dateStr + timestamp;
        }
        
        // Ensure exactly 10 chars
        if (fingerprint.length > 10) {
            fingerprint = fingerprint.substring(0, 10);
        } else {
            while (fingerprint.length < 10) {
                fingerprint += '0';
            }
        }
        
        return fingerprint;
    }
})();