# Twitch Listener Microservice

## 📖 Vue d'ensemble

Ce projet est un **microservice d'ingestion haute performance** conçu pour écouter, normaliser et dispatcher les événements Twitch en temps réel. Il agit comme une passerelle unique entre Twitch et votre écosystème applicatif.

Il gère la complexité des protocoles Twitch (Webhooks EventSub, WebSocket IRC), sécurise les échanges, et transforme toutes les données hétérogènes en un format standardisé (`TwitchEvent`) avant de les envoyer à votre API principale (Dispatcher).

---

## 🏗 Architecture

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
    Ingest -->|TwitchEvent| Dispatcher[Dispatcher Service]

    Dispatcher -->|POST /events| MainAPI[Main API / Backend]
```

### Composants Principaux

1.  **EventSub Service** : Gère les abonnements Webhooks (Follows, Subs, Stream Online...). Vérifie les signatures cryptographiques HMAC-SHA256 pour garantir la sécurité.
2.  **IRC Service** : Se connecte au chat Twitch via WebSocket. Gère le buffering des messages pour éviter de saturer le dispatcher.
3.  **Ingest Service** : Point central de normalisation. Transforme n'importe quel événement (chat ou webhook) en un objet standard.
4.  **Dispatcher Service** : Envoie les événements normalisés vers votre API. Gère les retries avec "Exponential Backoff" en cas de panne de votre API.
5.  **Scheduler Service** (Prod uniquement) : Synchronise périodiquement la liste des chaînes à écouter depuis votre service de base de données (DB Service).

---

## 🚀 Fonctionnalités Clés

- **Multi-Protocole** : Support simultané de EventSub (Webhooks) et IRC (Chat).
- **Normalisation Unique** : Format de sortie unique quel que soit l'événement source.
- **Mode Mock** : Générateur de faux événements intégré pour développer sans connexion internet ni compte Twitch.
- **Hot-Swapping** : Ajout/Suppression de chaînes à écouter dynamiquement sans redémarrage (via API Admin ou Scheduler).
- **Résilience** :
  - Reconnexion automatique IRC.
  - Retry HTTP intelligent vers le Dispatcher (1s, 2s, 4s, 8s, 16s + Jitter).
  - Buffering des messages de chat (batching).

---

## ⚙️ Configuration

### Variables d'Environnement (`.env`)

| Variable                   | Description                                     | Défaut                            |
| :------------------------- | :---------------------------------------------- | :-------------------------------- |
| `NODE_ENV`                 | Environnement (`local`, `production`, `test`)   | `local`                           |
| `PORT`                     | Port du serveur HTTP                            | `3000`                            |
| `USE_MOCK`                 | Activer le mode simulation (`true`/`false`)     | `false`                           |
| `DISPATCHER_URL`           | URL de votre API qui recevra les événements     | `http://localhost:4000/events`    |
| `DB_SERVICE_URL`           | URL pour récupérer la config des chaînes (Prod) | `http://localhost:5000/listeners` |
| `SYNC_INTERVAL_MS`         | Fréquence de synchro avec DB Service (ms)       | `60000` (1min)                    |
| `CHAT_BUFFER_TIME`         | Temps de buffer pour les messages IRC (ms)      | `5000`                            |
| `TWITCH_CLIENT_ID`         | Client ID Twitch (Requis si !Mock)              | -                                 |
| `TWITCH_APP_ACCESS_TOKEN`  | App Token Twitch (Requis si !Mock)              | -                                 |
| `TWITCH_WEBHOOK_SECRET`    | Secret pour signer les webhooks                 | -                                 |
| `PUBLIC_EVENTSUB_CALLBACK` | URL publique de ce service (ex: ngrok)          | -                                 |

### Exemples de fichiers .env

#### 1. Développement (Mode Mock)

Idéal pour tester en local sans connexion Twitch ni credentials.

```env
NODE_ENV=local
PORT=3000
USE_MOCK=true
DISPATCHER_URL=http://localhost:4000/events
```

#### 2. Production (Réel)

Configuration type pour un déploiement réel avec connexion à Twitch et aux autres microservices.

```env
NODE_ENV=production
PORT=3000
USE_MOCK=false

# Communication inter-services
DISPATCHER_URL=http://mon-api-backend/events
DB_SERVICE_URL=http://mon-service-auth/internal/channels
SYNC_INTERVAL_MS=60000

# Twitch API
TWITCH_CLIENT_ID=123456789abcdef
TWITCH_APP_ACCESS_TOKEN=oauth_token_secret
TWITCH_WEBHOOK_SECRET=mon_secret_hmac_complexe
PUBLIC_EVENTSUB_CALLBACK=https://mon-domaine-public.com
```

### Configuration des Chaînes

- **Développement** : Fichier `src/config/local/channels.json`.
- **Production** : Via `DB_SERVICE_URL`. Le service attend une réponse JSON avec ce format :

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

## 🔌 API Reference

### 1. Health Check

Vérifier l'état du service.

- **Route** : `GET /health`
- **Réponse (200 OK)** :
  ```json
  {
    "status": "healthy",
    "timestamp": "2023-10-27T10:00:00.000Z",
    "environment": "production"
  }
  ```

### 2. Métriques

Obtenir des statistiques sur les événements traités.

- **Global** : `GET /metrics`
- **Par Chaîne** : `GET /metrics/:channelId`
- **Par User** : `GET /metrics/:channelId/users/:userId`
- **Réponse (200 OK)** :
  ```json
  {
    "totalEvents": 150,
    "byType": {
      "message": 140,
      "channel.follow": 10
    },
    "uptime": 3600
  }
  ```

### 3. Webhook Callback (Interne Twitch)

Route appelée par Twitch pour envoyer des notifications.

- **Route** : `POST /eventsub/callback`
- **Headers Requis** :
  - `Twitch-Eventsub-Message-Id`
  - `Twitch-Eventsub-Message-Timestamp`
  - `Twitch-Eventsub-Message-Signature` (HMAC-SHA256)
- **Comportement** :
  - Vérifie la signature.
  - Si type `webhook_callback_verification` : Renvoie le challenge.
  - Si type `notification` : Traite l'événement et renvoie 202 Accepted.

### 4. Admin - Ajouter une chaîne

Ajouter manuellement une chaîne à écouter (utile pour le debug ou l'ajout immédiat).

- **Route** : `POST /admin/channels`
- **Body Requis** :
  ```json
  {
    "twitchUserId": "987654321",
    "login": "nouveau_streamer",
    "listenEventSub": true,
    "listenChatIrc": true
  }
  ```
- **Réponse (201 Created)** :
  ```json
  { "status": "channel added" }
  ```

---

## 📦 Format de Sortie (Vers Dispatcher)

Votre API (`DISPATCHER_URL`) recevra des requêtes `POST` avec le corps suivant.
**Note : Le payload est TOUJOURS un tableau JSON (Array).**

### Structure `TwitchEvent`

```typescript
interface TwitchEvent {
  id: string; // UUID unique de l'événement
  source: string; // "eventsub" ou "irc"
  type: string; // ex: "message", "channel.follow", "stream.online"
  timestamp: string; // ISO 8601
  version: string; // "1.0"

  // Identifiants contextuels (si disponibles)
  channelId?: string; // ID Twitch du broadcaster
  channelLogin?: string; // Login du broadcaster
  userId?: string; // ID Twitch de l'utilisateur (source de l'action)
  userLogin?: string; // Login de l'utilisateur

  // Données brutes ou spécifiques
  payload: any;
}
```

### Exemple : Batch Mixte (Chat + Follow)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "source": "irc",
    "type": "message",
    "timestamp": "2023-10-27T10:05:00.000Z",
    "version": "1.0",
    "channelLogin": "mon_streamer",
    "userLogin": "viewer_sympa",
    "payload": {
      "message": "Hello world!",
      "raw": ":viewer_sympa!...! PRIVMSG #mon_streamer :Hello world!"
    }
  },
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
      "user_id": "87654321",
      "user_login": "nouveau_follower",
      "broadcaster_user_id": "12345678"
    }
  }
]
```

---

## 🛠 Installation et Démarrage

### Prérequis

- Node.js v18+
- npm

### Installation

```bash
npm install
```

### Mode Développement (Hot Reload)

```bash
npm run dev
```

- Charge la config depuis `src/config/local/channels.json`.
- Si `USE_MOCK=true`, génère de faux événements.

### Mode Production

```bash
npm run build
npm start
```

- Active le `SchedulerService`.
- Appelle `DB_SERVICE_URL` au démarrage pour la config.

### Tests

```bash
npm test
```

Lance la suite de tests unitaires avec Jest.

---

## 🛡 Sécurité

- **Signature Webhook** : Tous les appels sur `/eventsub/callback` sont rejetés si la signature HMAC ne correspond pas à `TWITCH_WEBHOOK_SECRET`.
- **CORS** : Configurable via `CORS_ALLOWED_ORIGINS` dans `.env`.
- **Validation** : Les entrées API sont typées et validées.
