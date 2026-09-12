use crate::error::{ApiError, ApiResult};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use base64::{Engine, engine::general_purpose::STANDARD};
use rand::RngCore;
pub fn encrypt(key: &[u8; 32], secret: &str) -> ApiResult<String> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce), secret.as_bytes())
        .map_err(|_| ApiError::bad("Credential encryption failed"))?;
    Ok(STANDARD.encode([nonce.to_vec(), encrypted].concat()))
}
pub fn decrypt(key: &[u8; 32], data: &str) -> ApiResult<String> {
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| ApiError::bad("Stored credential is invalid"))?;
    if bytes.len() < 28 {
        return Err(ApiError::bad("Stored credential is invalid"));
    }
    let cipher = Aes256Gcm::new(key.into());
    let plain = cipher
        .decrypt(Nonce::from_slice(&bytes[..12]), &bytes[12..])
        .map_err(|_| ApiError::bad("Cannot decrypt credential; check ENCRYPTION_KEY"))?;
    String::from_utf8(plain).map_err(|_| ApiError::bad("Stored credential is invalid"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip_and_tamper() {
        let key = [7; 32];
        let value = encrypt(&key, "private-stream-key").unwrap();
        assert!(!value.contains("private-stream-key"));
        assert_eq!(decrypt(&key, &value).unwrap(), "private-stream-key");
        assert!(decrypt(&[8; 32], &value).is_err());
        assert!(decrypt(&key, "YQ==").is_err());
    }
}
