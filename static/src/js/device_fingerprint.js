/** @odoo-module */
// File: static/src/js/device_fingerprint.js

/**
 * CyberSource Device Fingerprint implementation
 * This script loads the ThreatMetrix service to collect device fingerprint data
 * which will be used during payment processing for fraud detection
 */

// Self-executing function to avoid polluting global namespace
(function() {
    "use strict";

    // Configuration: Change these values based on environment
    const TEST_ORG_ID = "1snn5n9w";
    const PROD_ORG_ID = "k8vif92e";
    
    // Determine which org_id to use based on environment
    // You can modify this logic to detect environment - this example uses a simple URL check
    const isProduction = window.location.hostname.indexOf('test') === -1 
                        && window.location.hostname.indexOf('dev') === -1
                        && window.location.hostname.indexOf('staging') === -1;
    const orgId = isProduction ? PROD_ORG_ID : TEST_ORG_ID;

    /**
     * Generate a device fingerprint and store it
     * @returns {String} The device fingerprint ID
     */
    function generateDeviceFingerprint() {
        // Generate a unique ID for this session (use transaction reference if available)
        // or generate a timestamp-based ID if no transaction reference exists
        let deviceFingerprint;
        
        // Try to get from the page if it exists (transaction reference)
        const orderReference = document.querySelector('input[name="reference"]')?.value;
        
        if (orderReference) {
            // Use order reference as part of fingerprint
            deviceFingerprint = orderReference.replace(/\D/g, ''); // Keep only numbers
        } else {
            // Generate a numeric ID based on timestamp
            deviceFingerprint = Math.floor(Date.now() / 100).toString().slice(-10);
        }
        
        // Store the fingerprint for later use
        localStorage.setItem('cybersource_device_fingerprint', deviceFingerprint);
        window.cybersourceFingerprint = deviceFingerprint;
        
        return deviceFingerprint;
    }

    /**
     * Load the ThreatMetrix script with proper session ID
     */
    function loadDeviceFingerprintScript() {
        const deviceFingerprint = generateDeviceFingerprint();
        
        // Get merchant ID from the page if possible, or use a default
        let merchantId = "visanetgt_kani"; // Default value, customize as needed
        
        // Create the session ID by combining merchant ID and device fingerprint
        const sessionId = merchantId + deviceFingerprint;
        
        // Create and append the ThreatMetrix script to the head
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = `https://h.online-metrix.net/fp/tags.js?org_id=${orgId}&session_id=${sessionId}`;
        document.head.appendChild(script);
        
        // Add the noscript iframe fallback to the body
        const noscriptContent = document.createElement('div');
        noscriptContent.innerHTML = `
            <noscript>
                <iframe style="width: 100px; height: 100px; border: 0; position:absolute; top: -5000px;" 
                        src="https://h.online-metrix.net/fp/tags?org_id=${orgId}&session_id=${sessionId}">
                </iframe>
            </noscript>
        `;
        
        // Append to body when DOM is ready
        if (document.body) {
            document.body.appendChild(noscriptContent);
        } else {
            // If body isn't ready yet, wait for DOMContentLoaded
            document.addEventListener('DOMContentLoaded', function() {
                document.body.appendChild(noscriptContent);
            });
        }
        
        console.log(`CyberSource Device Fingerprint initialized: ${deviceFingerprint}`);
        return deviceFingerprint;
    }
    
    // Initialize as soon as possible
    loadDeviceFingerprintScript();
})();