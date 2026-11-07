from fastapi import APIRouter

from kira.api import auth

router = APIRouter(tags=["Sign-in"])
router.add_api_route("/login", auth.login, methods=["POST"])
router.add_api_route("/logout", auth.logout, methods=["POST"])
router.add_api_route("/me", auth.me, methods=["GET"])
