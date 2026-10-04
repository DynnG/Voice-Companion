from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
import main

ORIGIN = "https://frontend-fawn-gamma-48.vercel.app"

@pytest.mark.parametrize("route", ["/interview/validate-job-title", "/api/interview/validate-job-title"])
def test_production_frontend_can_validate_job_title(route):
    client = TestClient(main.app)
    preflight = client.options(route, headers={
        "Origin": ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == ORIGIN
    validator = AsyncMock(return_value=True)
    with patch.object(main.GeminiInterviewService.get_instance(), "validate_job_title", validator):
        response = client.post(route, headers={"Origin": ORIGIN}, json={"job_role": "Dentist"})
    assert response.status_code == 200
    assert response.json() == {"is_valid": True}
    assert response.headers["access-control-allow-origin"] == ORIGIN
    validator.assert_awaited_once_with("Dentist")


def test_unknown_frontend_origin_is_rejected():
    response = TestClient(main.app).options("/interview/validate-job-title", headers={
        "Origin": "https://untrusted.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
