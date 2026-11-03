import pytest
import asyncio
from workers.common.safe_fetcher import validate_url_safe, SSRFValidationError, extract_visible_text
from workers.scoring.engine import score_local_business_website_opportunity


def test_ssrf_blocks_private_and_localhost_ips():
    # Loopback
    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://127.0.0.1:8080/admin")

    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://localhost:3000")

    # Cloud metadata link-local IP
    with pytest.raises(SSRFValidationError):
        validate_url_safe("http://169.254.169.254/latest/meta-data/")

    # Disallowed scheme
    with pytest.raises(SSRFValidationError):
        validate_url_safe("file:///etc/passwd")

    with pytest.raises(SSRFValidationError):
        validate_url_safe("ftp://files.example.com")


def test_extract_visible_text_strips_scripts_and_tags():
    html = """
    <html>
      <head><script>alert('xss');</script><style>body { color: red; }</style></head>
      <body>
        <h1>Welcome to Clinic</h1>
        <p>Book your appointment online today.</p>
      </body>
    </html>
    """
    text = extract_visible_text(html)
    assert "alert('xss')" not in text
    assert "color: red" not in text
    assert "Welcome to Clinic" in text
    assert "Book your appointment online today" in text


def test_scoring_is_deterministic_and_transparent():
    lead_data = {
        "organisation_name": "Apex Dental Clinic",
        "category": "Clinic",
        "location": "Coimbatore, Tamil Nadu",
        "website_url": "https://apexdental.in",
        "website_status": "appears_outdated",
        "phone": "9876543210",
        "email": "contact@apexdental.in"
    }

    measured_audit = {
        "is_https": False,
        "has_viewport": False,
        "has_whatsapp": False,
        "has_title": True
    }

    result1 = score_local_business_website_opportunity(lead_data, measured_audit)
    result2 = score_local_business_website_opportunity(lead_data, measured_audit)

    # Determinism test
    assert result1.score == result2.score
    assert result1.score >= 70  # Outdated + no https + no viewport + booking heavy clinic
    assert result1.confidence == "high"
    assert len(result1.unknowns) == 0
    assert any(b.basis == "measured" for b in result1.breakdown)
