# AdsPower RPA Launcher

A comprehensive automation system for managing AdsPower profiles with infinite loop capabilities, strict lifecycle control, and human-like behavior simulation.

## Features

- **Profile Lifecycle Management**: Create, launch, run, close, and delete profiles automatically
- **Infinite Loop Operation**: Continuous profile recycling with no idle gaps
- **Proxy Management**: Automatic proxy assignment and rotation
- **Mouse Simulation**: Human-like movement patterns for natural browsing behavior
- **Device Type Support**: PC, Mac, and Mobile device simulation
- **Real-time Dashboard**: Clean interface for monitoring and control
- **Comprehensive Logging**: Detailed activity tracking and export capabilities
- **Slot Management**: Strict control over concurrent profile limits
- **Auto-cleanup**: Automatic deletion of completed profiles

## System Requirements

- **Operating System**: Windows 10/11, macOS, or Linux
- **Memory**: Minimum 8GB RAM (16GB+ recommended for 40+ profiles)
- **CPU**: Multi-core processor (8+ cores recommended)
- **AdsPower**: AdsPower application installed and running
- **Node.js**: Version 16.x or higher

## Installation

1. **Clone or download the project**

   ```bash
   cd "c:\Users\LAptopa\OneDrive\Desktop\adsPower project\adspower-rpa-launcher"
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Install additional system dependencies** (Windows)
   ```bash
   # For mouse automation (optional - may require Visual Studio Build Tools)
   npm install robotjs --save-optional
   ```

## Configuration

1. **AdsPower Setup**

   - Ensure AdsPower is running on your system
   - Default API endpoint: `http://local.adspower.net:50325`
   - Verify API access in the application settings

2. **Proxy Configuration**

   - Import proxies via the Proxy Manager
   - Supported formats: IP:PORT or IP:PORT:USERNAME:PASSWORD
   - Supports HTTP, HTTPS, SOCKS4, and SOCKS5 protocols

3. **Profile Settings**
   - Set maximum concurrent profiles (default: 40)
   - Configure default device type and target URLs
   - Enable/disable mouse movement simulation

## Usage

### Starting the Application

1. **Development Mode**

   ```bash
   npm start
   ```

2. **Production Build**
   ```bash
   npm run build
   npm run dist
   ```

### Basic Workflow

1. **Configure Settings**

   - Go to Settings tab
   - Set maximum concurrent profiles
   - Configure AdsPower API URL
   - Test connection to AdsPower

2. **Import Proxies**

   - Navigate to Proxy Manager
   - Add individual proxies or bulk import
   - Verify proxy functionality with test feature

3. **Create Profiles**

   - Go to Profile Manager
   - Create profiles with desired settings
   - Assign proxies and target URLs

4. **Launch Automation**
   - Profiles will launch automatically based on available slots
   - Monitor progress in the Dashboard
   - Check logs for detailed activity tracking

### Profile Lifecycle

```
Create → Launch → Run → Complete → Delete → Create New
```

- **Create**: Profile created in database and AdsPower
- **Launch**: Profile browser window opened
- **Run**: Profile executing tasks with mouse simulation
- **Complete**: Task finished, profile marked for deletion
- **Delete**: Profile removed, slot available for new profile

## API Endpoints

### Profiles

- `GET /api/profiles` - List all profiles
- `POST /api/profiles` - Create new profile
- `POST /api/profiles/:id/launch` - Launch profile
- `POST /api/profiles/:id/stop` - Stop profile
- `DELETE /api/profiles/:id` - Delete profile
- `GET /api/profiles/slots/available` - Get available slots

### Proxies

- `GET /api/proxies` - List all proxies
- `POST /api/proxies` - Add new proxy
- `POST /api/proxies/bulk` - Bulk import proxies
- `DELETE /api/proxies/:id` - Delete proxy
- `POST /api/proxies/:id/test` - Test proxy connection

### Settings

- `GET /api/settings` - Get all settings
- `PUT /api/settings/:key` - Update setting
- `POST /api/settings/bulk` - Update multiple settings
- `POST /api/settings/test-adspower` - Test AdsPower connection

### Logs

- `GET /api/logs` - Get logs with filtering
- `POST /api/logs` - Add log entry
- `GET /api/logs/export` - Export logs
- `DELETE /api/logs/cleanup` - Clear old logs

## Configuration Options

### Performance Settings

| Setting                   | Default | Description                             |
| ------------------------- | ------- | --------------------------------------- |
| `max_concurrent_profiles` | 40      | Maximum profiles running simultaneously |
| `profile_timeout_minutes` | 30      | Profile inactivity timeout              |
| `mouse_movement_enabled`  | true    | Enable mouse simulation                 |
| `auto_delete_completed`   | true    | Auto-delete finished profiles           |

### Device Profiles

- **PC**: Standard desktop browser simulation
- **Mac**: macOS-specific browser fingerprinting
- **Mobile**: Mobile device simulation with touch events

### Mouse Movement Patterns

- **Natural**: Balanced speed and randomness
- **Slow**: Careful, deliberate movements
- **Fast**: Quick, efficient movements

## Troubleshooting

### Common Issues

1. **AdsPower Connection Failed**

   - Verify AdsPower is running
   - Check API URL in settings
   - Ensure no firewall blocking

2. **Profile Launch Errors**

   - Check available memory and CPU
   - Verify proxy configuration
   - Review AdsPower profile limits

3. **Mouse Simulation Not Working**

   - Install robotjs dependencies
   - Run as administrator on Windows
   - Check system permissions

4. **Performance Issues**
   - Reduce max concurrent profiles
   - Add more RAM
   - Use faster storage (SSD)

### Performance Optimization

- **Memory**: 2GB RAM per 10 profiles (approximate)
- **CPU**: Multi-core recommended for parallel processing
- **Storage**: SSD for better database performance
- **Network**: Stable connection for proxy reliability

## Development

### Project Structure

```
adspower-rpa-launcher/
├── src/
│   ├── frontend/          # React components
│   │   └── components/    # UI components
│   └── backend/           # Node.js server
│       ├── api/           # API routes
│       ├── services/      # Business logic
│       └── database/      # SQLite database
├── public/                # Electron main process
└── package.json          # Dependencies and scripts
```

### Adding New Features

1. **Backend Services**: Add to `src/backend/services/`
2. **API Routes**: Add to `src/backend/api/`
3. **Frontend Components**: Add to `src/frontend/components/`
4. **Database Schema**: Modify `src/backend/database/database.js`

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please create an issue in the project repository.

## Roadmap

- [ ] Advanced scheduling system
- [ ] Profile templates and presets
- [ ] Enhanced analytics and reporting
- [ ] Multi-server deployment support
- [ ] REST API documentation
- [ ] Docker containerization
- [ ] Cloud proxy integration
