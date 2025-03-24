// Numeric fingerprint implementation for CyberSource
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        // Clear previous fingerprints
        localStorage.removeItem('cybersource_device_fingerprint');
        
        // Only initialize once per page
        if (window.cybersourceFingerprint) {
            return;
        }
        
        // Generate a 10-digit numeric fingerprint
        const numericId = Math.floor(Date.now() / 100).toString().slice(-10);
        window.cybersourceFingerprint = numericId;
        localStorage.setItem('cybersource_device_fingerprint', numericId);
        console.log('CyberSource numeric fingerprint initialized:', numericId);
        
        // Add iframe with numeric ID
        const iframe = document.createElement('iframe');
        iframe.style = 'width:1px; height:1px; position:absolute; left:-999px;';
        iframe.src = 'https://h.online-metrix.net/fp/tags?org_id=1snn5n9w&session_id=' + numericId;
        document.body.appendChild(iframe);
    });
})();