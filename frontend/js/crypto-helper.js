/* ============================================================
   crypto-helper.js — Native E2EE Web Crypto Module
   Elliptic Curve Diffie-Hellman (ECDH) P-256 & AES-GCM 256-bit
   ============================================================ */

// 1. Generate P-256 ECDH Key Pair
async function generateE2EEKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return { publicKey, privateKey };
}

// 2. Import private key from JWK representation
async function importMyPrivateKey(jwk) {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// 3. Import peer public key from JWK representation
async function importPeerPublicKey(jwk) {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// 4. Derive shared symmetric key (AES-GCM-256) using ECDH
async function deriveSharedKey(myPrivateJwk, peerPublicJwk) {
  const myPriv = await importMyPrivateKey(myPrivateJwk);
  const peerPub = await importPeerPublicKey(peerPublicJwk);
  return await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPub },
    myPriv,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// 5. Encrypt plaintext string using AES-GCM with shared symmetric key
async function encryptMessage(plaintext, sharedKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    enc.encode(plaintext)
  );
  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv)
  };
}

// 6. Decrypt ciphertext string using AES-GCM with shared symmetric key
async function decryptMessage(ciphertextBase64, ivBase64, sharedKey) {
  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    ciphertext
  );
  return new TextDecoder().decode(decryptedBuffer);
}

// Helper: ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// 7. Auto-initialize keys for current user and synchronize with DB
async function initializeE2EEKeys() {
  const me = AppState.getUser();
  if (!me) return;

  const privKeyKey = `e2e_priv_${me.id}`;
  const pubKeyKey = `e2e_pub_${me.id}`;

  let localPriv = localStorage.getItem(privKeyKey);
  let localPub = localStorage.getItem(pubKeyKey);

  if (!localPriv || !localPub) {
    console.log('Generating new client-side E2EE key pair...');
    try {
      const keys = await generateE2EEKeyPair();
      localPriv = JSON.stringify(keys.privateKey);
      localPub = JSON.stringify(keys.publicKey);
      localStorage.setItem(privKeyKey, localPriv);
      localStorage.setItem(pubKeyKey, localPub);

      // Save to server
      const updatedUser = await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ public_key: localPub })
      });
      if (updatedUser) {
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
      console.log('E2EE key pair initialized and public key registered with server.');
    } catch (err) {
      console.error('Failed to initialize E2EE key pair:', err);
    }
  } else {
    // Keys exist locally, check if registered on profile
    if (!me.public_key) {
      console.log('Syncing local E2EE public key with server...');
      try {
        const updatedUser = await apiFetch('/users/me', {
          method: 'PUT',
          body: JSON.stringify({ public_key: localPub })
        });
        if (updatedUser) {
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
        console.log('E2EE public key synced with server.');
      } catch (err) {
        console.error('Failed to sync E2EE public key:', err);
      }
    }
  }
}

// Auto-run key initialization on script load if logged in
if (typeof AppState !== 'undefined' && AppState.isLoggedIn()) {
  initializeE2EEKeys().catch(err => console.error('E2EE auto-init error:', err));
}
