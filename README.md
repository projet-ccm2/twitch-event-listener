# Twitch Listener Microservice

## Vue d'ensemble

Ce projet est un **microservice d'ingestion haute performance** conçu pour écouter, normaliser et dispatcher les événements Twitch en temps réel. Il agit comme une passerelle unique entre Twitch et votre écosystème applicatif.

Il gère la complexité des protocoles Twitch (Webhooks EventSub, WebSocket IRC), sécurise les échanges, et transforme toutes les données hétérogènes en un format standardisé (`TwitchEvent`) avant de les envoyer à votre API principale (Dispatcher).

---

## Architecture

Le service est construit autour de plusieurs composants clés :

```mermaid
graph TD
    Twitch[Twitch Platform] -->|Webhooks (HTTP)| EventSub[EventSub Service]
    Twitch -->|WebSocket| IRC[IRC Service]

    DBService[DB Service] -->|GET /channels| Scheduler[Scheduler Service]
    Scheduler -->|Update Config| Config[In-Memory Config]

    EventSub -->|Raw Event| Ingest[Ingest Service]
    IRC -->|Raw Message| Ingest

    Ingest -->|Normalize| Ingest
    Ingest -->|TwitchEvent[]| Dispatcher[Dispatcher Service]

    Dispatcher -->|POST /events| MainAPI[Main API / Backend]
```

### Composants Principaux

1. **EventSub Service** : Gère les abonnements Webhooks (Follows, Subs, Stream Online...). Vérifie les signatures cryptographiques HMAC-SHA256 pour garantir la sécurité.
2. **IRC Service** : Se connecte au chat Twitch via WebSocket. Demande les tags Twitch IRC pour enrichir les messages avec `channelId` et `userId`, puis gère le buffering pour éviter de saturer le dispatcher.
3. **Ingest Service** : Point central de normalisation. Transforme n'importe quel événement (chat ou webhook) en un objet standard.
4. **Dispatcher Service** : Envoie les événements normalisés vers votre API. Gère les retries sur les erreurs retriables.
5. **Scheduler Service** (Prod uniquement) : Synchronise périodiquement la liste des chaînes à écouter depuis votre service de base de données (DB Service).

---

## Fonctionnalités Clés

- **Multi-Protocole** : Support simultané de EventSub (Webhooks) et IRC (Chat).
- **Normalisation Unique** : Format de sortie unique quel que soit l'événement source.
- **Mode Mock** : Générateur de faux événements intégré pour développer sans connexion internet ni compte Twitch.
- **Hot-Swapping** : Ajout/Suppression de chaînes à écouter dynamiquement sans redémarrage (via Scheduler).
- **Résilience** :
  - Reconnexion automatique IRC.
  - Retry HTTP ciblé vers le dispatcher pour les erreurs retriables.
  - Buffering des messages de chat (batching).
  - Limitation des retries EventSub sur les topics qui échouent déjà.

---

## Configuration

### Variables d'Environnement (`.env`)

| Variable                   | Description                                     | Défaut                            |
| :------------------------- | :---------------------------------------------- | :-------------------------------- |
| `NODE_ENV`                 | Environnement (`local`, `production`, `test`)   | `local`                           |
| `PORT`                     | Port du serveur HTTP                            | `3000`                            |
| `USE_MOCK`                 | Activer le mode simulation (`true`/`false`)     | `false`                           |
| `DISPATCHER_URL`           | URL de votre API qui recevra les événements     | `http://localhost:4000/events`    |
| `DB_SERVICE_URL`           | URL pour récupérer la config des chaînes (Prod) | `http://localhost:5000/listeners` |
| `SYNC_INTERVAL_MS`         | Fréquence de synchro avec DB Service (ms)       | `60000`                           |
| `CHAT_BUFFER_TIME`         | Temps de buffer pour les messages IRC (ms)      | `5000`                            |
| `BATCH_INTERVAL_MS`        | Temps max avant flush du buffer global          | `300000`                          |
| `TWITCH_CLIENT_ID`         | Client ID Twitch                                | -                                 |
| `TWITCH_CLIENT_SECRET`     | Client Secret Twitch pour EventSub              | -                                 |
| `TWITCH_WEBHOOK_SECRET`    | Secret HMAC des webhooks                        | -                                 |
| `PUBLIC_EVENTSUB_CALLBACK` | URL publique de callback EventSub               | -                                 |
| `TWITCH_IRC_NICK`          | Nick IRC Twitch                                 | `justinfan12345`                  |
| `TWITCH_IRC_PASSWORD`      | Password IRC Twitch                             | `SCHMOOPIIE`                      |

### Exemples

```env
NODE_ENV=production
PORT=3000
USE_MOCK=false

DISPATCHER_URL=http://mon-api-backend/events
DB_SERVICE_URL=http://mon-service-auth/internal/channels
SYNC_INTERVAL_MS=60000
CHAT_BUFFER_TIME=5000
BATCH_INTERVAL_MS=300000

TWITCH_CLIENT_ID=123456789abcdef
TWITCH_CLIENT_SECRET=mon_client_secret_twitch
TWITCH_WEBHOOK_SECRET=mon_secret_hmac_complexe
PUBLIC_EVENTSUB_CALLBACK=https://mon-domaine-public.com
```

### Configuration des Chaînes

- **Développement** : Fichier `src/config/local/channels.json`
- **Production** : Via `DB_SERVICE_URL`

Format attendu :

```json
[
  {
    "twitchUserId": "12345678",
    "login": "mon_streamer",
    "scopes": ["channel:read:subscriptions"],
    "listenEventSub": true,
    "listenChatIrc": true,
    "eventSubTopics": ["channel.follow", "stream.online"]
  }
]
```

---

## API Reference

### 1. Health Check

- **Route** : `GET /health`
- **Réponse** :
  ```json
  {
    "status": "healthy",
    "timestamp": "2023-10-27T10:00:00.000Z",
    "environment": "production"
  }
  ```

### 2. Métriques

- **Global** : `GET /metrics`
- **Par chaîne** : `GET /metrics/:channelId`
- **Par user** : `GET /metrics/:channelId/users/:userId`

### 3. Webhook Callback Twitch

- **Route** : `POST /eventsub/callback`
- **Headers requis** :
  - `Twitch-Eventsub-Message-Id`
  - `Twitch-Eventsub-Message-Timestamp`
  - `Twitch-Eventsub-Message-Signature`
  - `Twitch-Eventsub-Message-Type`

Comportement :

- vérifie la signature
- répond au challenge Twitch
- normalise et ingère les notifications
- traite les revocations

---

## Format envoyé au Dispatcher

Le dispatcher reçoit **toujours un tableau JSON** de `TwitchEvent`, même lorsqu’un seul événement est flushé.

### Structure `TwitchEvent`

```ts
interface TwitchEvent {
  id: string;
  source: string; // "eventsub", "irc", "mock", ...
  type: string;
  timestamp: string; // ISO 8601
  version: string; // "1.0"
  payload: unknown;
  channelId?: string;
  channelLogin?: string;
  userId?: string;
  userLogin?: string;
}
```

### Règles de normalisation réellement appliquées

- `source` vient de la source brute (`eventsub`, `irc`, `mock`, etc.)
- `type` vient de `rawEvent.subscription.type` si présent, sinon `rawEvent.type`
- `payload` vaut `rawEvent.event`, sinon `rawEvent.payload`, sinon l’objet brut
- `channelId`, `channelLogin`, `userId`, `userLogin` sont envoyés au niveau top-level du `TwitchEvent`

### Cas IRC `message`

Pour les messages chat IRC :

- `type` = `message`
- `source` = `irc`
- `channelId` provient de `room-id` si Twitch l’envoie dans les tags IRC
- `userId` provient de `user-id` si Twitch l’envoie dans les tags IRC
- si `room-id` est absent, `channelId` retombe sur la config interne de la chaîne
- `payload.message` contient le texte brut du message
- `payload.raw` contient la ligne IRC brute reçue

Exemple réel de batch contenant un message IRC enrichi :

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "source": "irc",
    "type": "message",
    "timestamp": "2023-10-27T10:05:00.000Z",
    "version": "1.0",
    "channelId": "12345678",
    "channelLogin": "mon_streamer",
    "userId": "87654321",
    "userLogin": "viewer_sympa",
    "payload": {
      "message": "Hello world!",
      "raw": "@room-id=12345678;user-id=87654321 :viewer_sympa!viewer_sympa@viewer_sympa.tmi.twitch.tv PRIVMSG #mon_streamer :Hello world!"
    }
  }
]
```

### Cas EventSub

Pour les événements EventSub :

- `type` = `subscription.type`
- `source` = `eventsub`
- `payload` contient le payload webhook Twitch complet normalisé par le service EventSub
- `channelId` vient en priorité de `event.broadcaster_user_id`, sinon de `subscription.condition.broadcaster_user_id`
- `userId` vient de `event.user_id` quand Twitch le fournit

Exemple réel de batch contenant un follow EventSub :

```json
[
  {
    "id": "eventsub-subscription-id:event-id",
    "source": "eventsub",
    "type": "channel.follow",
    "timestamp": "2023-10-27T10:06:00.000Z",
    "version": "1.0",
    "channelId": "12345678",
    "channelLogin": "mon_streamer",
    "userId": "87654321",
    "userLogin": "nouveau_follower",
    "payload": {
      "subscription": {
        "id": "eventsub-subscription-id",
        "type": "channel.follow"
      },
      "event": {
        "user_id": "87654321",
        "user_login": "nouveau_follower",
        "broadcaster_user_id": "12345678",
        "broadcaster_user_login": "mon_streamer"
      }
    }
  }
]
```

### Points importants pour le backend consommateur

- le body reçu par `DISPATCHER_URL` est un **array**
- les identifiants utiles (`channelId`, `userId`) sont au niveau racine de chaque événement
- `payload` n’a pas la même forme entre IRC et EventSub
- pour le chat, il faut lire `type === "message"`

---

## Installation et Démarrage

### Prérequis

- Node.js v18+
- npm

### Installation

```bash
npm install
```

### Développement

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Tests

```bash
npm test
```

---

## Sécurité

- Les appels sur `/eventsub/callback` sont validés via HMAC avec `TWITCH_WEBHOOK_SECRET`
- Les accès interservices doivent passer par `DISPATCHER_URL` et `DB_SERVICE_URL`
- Les erreurs `4xx` non retriables côté dispatcher ne sont plus rejouées en boucle
