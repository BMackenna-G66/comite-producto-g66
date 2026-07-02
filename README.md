# Comité de Producto G66

Sistema de gestión y aprobación de nuevos productos para Global81 SpA / G66 Group.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Auth**: Firebase Authentication (Google OAuth)
- **Base de datos**: Firebase Firestore
- **IA**: Google Gemini 2.0 Flash
- **Hosting**: GitHub Pages (CI/CD vía GitHub Actions)

---

## Setup

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/comite-producto-g66.git
cd comite-producto-g66
npm install
```

### 2. Crear proyecto Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Crea un nuevo proyecto: `comite-producto-g66`
3. Activa **Authentication** → Sign-in method → **Google**
4. Activa **Firestore Database** → modo producción
5. En Configuración del proyecto → Tus apps → Web → Registrar app → copia las credenciales

### 3. Variables de entorno

Crea un archivo `.env.local` en la raíz:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=comite-producto-g66.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=comite-producto-g66
VITE_FIREBASE_STORAGE_BUCKET=comite-producto-g66.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_GEMINI_API_KEY=AIza...
```

### 4. Reglas de Firestore

En la consola de Firebase → Firestore → Reglas, pega el contenido de [`firestore.rules`](./firestore.rules) (o usa `firebase deploy --only firestore:rules` si tienes el Firebase CLI configurado).

Un usuario nunca puede cambiar su propio rol o empresa — solo un admin puede hacerlo. Todo usuario nuevo entra como `pending` (ver siguiente sección para promover al primer admin).

### 5. Correr en local

```bash
npm run dev
```

---

## Deploy a GitHub Pages

### Configurar secretos en GitHub

Ve a tu repo → Settings → Secrets and variables → Actions → New repository secret.

Agrega cada variable de `.env.local` como secret:

| Secret | Valor |
|--------|-------|
| `VITE_FIREBASE_API_KEY` | Tu API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `tu-proyecto.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `tu-proyecto` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `tu-proyecto.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Tu Sender ID |
| `VITE_FIREBASE_APP_ID` | Tu App ID |
| `VITE_GEMINI_API_KEY` | Tu Gemini API Key |

### Activar GitHub Pages

1. Settings → Pages → Source: **GitHub Actions**
2. Haz push a `main` → el workflow despliega automáticamente
3. La app queda en: `https://TU_USUARIO.github.io/comite-producto-g66/`

### Agregar dominio autorizado en Firebase

En Firebase → Authentication → Settings → Authorized domains → Agrega:
`TU_USUARIO.github.io`

---

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Todo: gestión de usuarios, crear/editar productos, sesiones |
| `member` | Crear/editar productos, conducir sesiones, gestionar riesgos |
| `observer` | Solo lectura |
| `pending` | Sin acceso hasta que el admin asigne un rol |

> **Todo usuario nuevo entra como `pending`**, incluido el primero — no hay auto-admin.
> Para crear el primer admin: inicia sesión una vez con tu cuenta de Google, luego ve a
> Firebase Console → Firestore Database → colección `users` → tu documento → cambia el
> campo `role` a `admin` manualmente. Después de eso, ya puedes aprobar al resto del
> comité desde `/admin` dentro de la app.

---

## Flujo de aprobación

```
Producto creado → Gate 1 (Levantamiento) → Gate 2 (Planificación) → Gate 3 (Ejecución/Cierre)
                         ↓                         ↓                         ↓
                   Sesión Comité            Sesión Comité            Sesión Comité
                   (Principios)           (SARLAFT/Riesgos)         (Sign-Off final)
```

---

## Gemini API Key

Obtén tu API Key en [aistudio.google.com](https://aistudio.google.com) → Get API Key.
