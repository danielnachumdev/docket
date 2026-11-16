from waymark.models import ApiToken, User


class ActorLabel:
    """Formats activity actor labels for humans and agents."""

    def label(
        self,
        *,
        user: User | None,
        user_id: int,
        token: ApiToken | None = None,
        token_name: str | None = None,
    ) -> str:
        human = self.human_name(user=user, user_id=user_id)
        agent = self.agent_name(token=token, token_name=token_name)
        if agent and human:
            return f"{human} · {agent}"
        if agent:
            return agent
        return human

    def human_name(self, *, user: User | None, user_id: int) -> str:
        if user is None:
            return f"User #{user_id}"
        name = (user.display_name or "").strip()
        if name:
            return name
        email = (user.email or "").strip()
        if email:
            return email
        return f"User #{user_id}"

    def agent_name(
        self, *, token: ApiToken | None = None, token_name: str | None = None
    ) -> str | None:
        name = token_name
        if name is None and token is not None:
            name = token.name
        cleaned = (name or "").strip()
        if not cleaned:
            return None
        return f"{cleaned} (agent)"


actor_label = ActorLabel()
