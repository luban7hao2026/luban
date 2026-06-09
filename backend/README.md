# Random Lunch API

FastAPI backend for the random lunch picker.

## Setup

```bash
cd backend
conda create -n random-lunch python=3.11
conda activate random-lunch
pip install -r requirements.txt
copy .env.example .env
```

Create the MySQL database first:

```sql
CREATE DATABASE random_lunch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then update `.env` with your MySQL username and password.

For existing databases, run the multi-user migration before starting the new
auth-enabled backend:

```sql
SOURCE backend/migrations/001_multi_user_auth.sql;
```

The migration assigns existing foods and pick logs to a non-login
`default-template` user. Each new real user receives a copied default food list
on registration.

Set a private auth secret in `.env`:

```env
AUTH_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_MINUTES=10080
```

## Run

```bash
uvicorn app.main:app --reload
```

API docs:

```text
http://127.0.0.1:8000/docs
```
