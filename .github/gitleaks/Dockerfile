# Образ gitleaks для job `secrets` в .github/workflows/ci.yml.
# Отдельный файл нужен, чтобы Dependabot видел версию: строку `docker run` в workflow он не читает.
# Дайджест защищает от подмены тега в реестре (docs/security.md, T8); Dependabot обновляет тег и дайджест вместе
FROM ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
