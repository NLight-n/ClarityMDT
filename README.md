# ClarityMDT - MDT Register Digital System

A comprehensive Multi-Disciplinary Team (MDT) case management system for healthcare institutions. This application facilitates the registration, review, and management of patient cases through scheduled MDT meetings with role-based access control.

## 🎯 Features

### Core Functionality
- **Case Management**: Create, edit, and manage patient cases with comprehensive clinical details
- **Meeting Scheduling**: Schedule and manage MDT meetings with case assignments
- **Rich Text Editing**: Advanced rich text editor with inline image support for radiology and pathology findings
- **Document Management**: Upload and manage case attachments with automatic PDF conversion for Office documents
- **Consensus Reports**: Generate and manage MDT consensus reports with digital signatures
- **Audit Logging**: Comprehensive audit trail of all user actions and system changes
- **Notifications**: Real-time notifications for case updates, meeting assignments, and system events

### Communication & Integration
- **Telegram Integration**: Link Telegram accounts for notifications and case updates
- **Email Notifications**: SMTP-based email notifications for important events
- **Backup & Restore**: Automated database and file storage backups with restore functionality

### Security & Administration
- **Role-Based Access Control**: Four user roles (Admin, Coordinator, Consultant, Viewer) with granular permissions
- **Secure Authentication**: NextAuth-based authentication with encrypted credentials
- **Encrypted Settings**: Sensitive configuration (Telegram tokens, SMTP passwords) stored encrypted in database
- **Hospital Branding**: Customizable hospital name and logo

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Authentication**: NextAuth.js v5
- **Object Storage**: MinIO (S3-compatible)
- **Styling**: TailwindCSS, shadcn-ui components
- **Rich Text Editor**: Tiptap
- **PDF Generation**: PDFKit
- **Document Conversion**: LibreOffice
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** (version 20.10 or later)
- **Docker Compose** (version 2.0 or later)
- **Git** (for cloning the repository)

## 🚀 Quick Start with Docker

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd mdtapp
```

### 2. Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/mdtapp

# PostgreSQL Service Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=mdtapp
POSTGRES_PORT=5432

# Application Port
PORT=3000

# NextAuth Configuration
NEXTAUTH_SECRET=your-secret-key-here

# MinIO Configuration
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=case-attachments
```

**Important**: 
- Generate a secure `NEXTAUTH_SECRET` using: `openssl rand -base64 32`
- Change all default passwords in production
- For Docker Compose, use service names (`postgres`, `minio`) as hostnames in `DATABASE_URL` and `MINIO_ENDPOINT`

### 3. Start the Application

Build and start all services:

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL database
- Start MinIO object storage
- Build and start the application
- Run database migrations automatically

### 4. Access the Application

- **Application**: http://localhost:3000 (or your configured PORT)
- **MinIO Console**: http://localhost:9001 (default credentials from `.env`)

### 5. Initial Setup

On first launch, you'll be redirected to the setup page where you can:
- Create the first admin user
- Configure hospital settings (name, logo)

## 📖 Detailed Setup Instructions

### Environment Variables

All configuration is done through the `.env` file. Key variables:

#### Database Configuration
- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_USER`: PostgreSQL username
- `POSTGRES_PASSWORD`: PostgreSQL password
- `POSTGRES_DB`: Database name
- `POSTGRES_PORT`: PostgreSQL port (default: 5432)

#### Application Configuration
- `PORT`: Application port (default: 3000)
- `NEXTAUTH_SECRET`: Secret key for JWT encryption (required)

#### MinIO Configuration
- `MINIO_ENDPOINT`: MinIO server endpoint (use `minio` for Docker Compose)
- `MINIO_PORT`: MinIO API port (default: 9000)
- `MINIO_CONSOLE_PORT`: MinIO Console port (default: 9001)
- `MINIO_ROOT_USER`: MinIO root username
- `MINIO_ROOT_PASSWORD`: MinIO root password
- `MINIO_ACCESS_KEY`: MinIO access key for application
- `MINIO_SECRET_KEY`: MinIO secret key for application
- `MINIO_BUCKET`: MinIO bucket name for file storage
- `MINIO_SSL`: Enable SSL for MinIO (true/false)

### Docker Services

The `docker-compose.yml` includes three services:

1. **postgres**: PostgreSQL 16 database
2. **minio**: MinIO object storage server
3. **app**: The MDT application (built from Dockerfile)

All services are connected via a Docker network and configured to restart automatically.

### Database Migrations

Database migrations run automatically on application startup. The Prisma client will apply any pending migrations.

### First-Time Setup

1. Access the application at http://localhost:3000
2. You'll be redirected to `/setup` if no users exist
3. Create your first admin account
4. Configure hospital settings
5. Start using the application!

## 👥 User Roles & Permissions

### Admin
- Full system access
- User and department management
- Coordinator assignment/revocation
- All case management operations
- System settings configuration
- Audit log access

### Coordinator
- Meeting management
- All case management operations
- Consensus report creation/editing
- Edit any specialist opinion
- Edit radiology/pathology findings
- Report generation

### Consultant
- Create cases in own department
- Edit cases in own department
- Add specialist opinions
- Edit own specialist opinions
- Edit radiology/pathology findings (if in relevant department)
- Resubmit cases

### Viewer
- View all cases (read-only)

## 🔧 Administration

### Telegram Integration

Configure Telegram notifications through the Admin settings:
1. Navigate to Settings → Admin → Telegram Settings
2. Enable Telegram linking
3. Enter bot name and token
4. Upload QR code for easy linking
5. Users can link their Telegram accounts from their profile

### Email Notifications

Configure SMTP settings through the Admin settings:
1. Navigate to Settings → Admin → Email Settings
2. Enable email notifications
3. Enter SMTP server details
4. Test email delivery

### Backup & Restore

Create backups and restore from the Backup tab:
1. Navigate to Settings → Admin → Backup
2. Create database or MinIO backups
3. Download backups for safekeeping
4. Restore from existing backups or uploaded files

**Note**: All sensitive settings (Telegram tokens, SMTP passwords) are encrypted using AES-256-GCM encryption.

## 🐳 Docker Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
```

### Rebuild Application
```bash
docker-compose build app
docker-compose up -d app
```

### Access Database
```bash
docker-compose exec postgres psql -U postgres -d mdtapp
```

### Access Application Container
```bash
docker-compose exec app sh
```

### Clean Up (⚠️ Removes all data)
```bash
docker-compose down -v
```


**Note**: This application is designed for healthcare environments. Ensure compliance with local healthcare data protection regulations (HIPAA, GDPR, etc.) before deployment in production.

