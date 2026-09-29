#!/usr/bin/env bash
# deploy.sh — Build, push, and redeploy Sprint Poker on Docker Swarm
#
# Usage:
#   ./deploy.sh
#
# Prerequisites:
#   - Docker logged in to your registry
#   - `docker context use <swarm-manager>` already set, OR run from the Swarm manager
#   - REGISTRY and DOMAIN env vars set, or edit the defaults below

set -euo pipefail

REGISTRY="${REGISTRY:-registry.vegadigital.dev}"
DOMAIN="${DOMAIN:-poker.vegadigital.dev}"
TAG="${TAG:-latest}"

SERVER_IMAGE="$REGISTRY/sprint-poker-server:$TAG"
CLIENT_IMAGE="$REGISTRY/sprint-poker-client:$TAG"

echo "==> Building server image: $SERVER_IMAGE"
docker build -t "$SERVER_IMAGE" ./server

echo "==> Building client image: $CLIENT_IMAGE"
docker build \
  --build-arg VITE_WS_URL="wss://$DOMAIN/ws" \
  -t "$CLIENT_IMAGE" \
  ./client

echo "==> Pushing images"
docker push "$SERVER_IMAGE"
docker push "$CLIENT_IMAGE"

echo "==> Deploying stack to Swarm"
docker stack deploy \
  -c deploy/stack.yml \
  --with-registry-auth \
  sprint-poker

echo "==> Done. Stack services:"
docker stack services sprint-poker
