# International Racing League Dashboard

A lightweight, static dashboard for a private Formula 1 online racing league. Built with vanilla HTML/CSS/JS + JSON data files for simple hosting and easy future API expansion.

## Folder Structure

```
.
├── index.html
├── standings.html
├── races.html
├── race.html
├── stats.html
├── history.html
├── archive.html
├── calendar.html
├── licenses.html
├── stewards.html
├── assets
│   ├── css
│   │   └── styles.css
│   ├── img
│   │   ├── tracks
│   │   ├── flags
│   │   └── teams
│   └── js
│       ├── admin.js
│       ├── calendar.js
│       ├── data.js
│       ├── history.js
│       ├── home.js
│       ├── licenses.js
│       ├── race-detail.js
│       ├── races.js
│       ├── standings-calc.js
│       ├── standings.js
│       ├── stats.js
│       └── stewards.js
└── data
    ├── circuits.json
    ├── drivers.json
    ├── flags.json
    ├── league-history.json
    ├── licenses.json
    ├── points.json
    ├── races.json
    ├── seasons.json
    ├── stewards.json
    ├── team-logos.json
    └── teams.json
```

## Run Locally

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## League History

Manual history data lives in `data/league-history.json`. Each season contains rounds with circuit, results, and fastest lap.

## Statistics

Stats are auto-computed from:
- Current season `data/races.json`
- Historical data in `data/league-history.json`

Tracked metrics include wins, sprint wins, podiums, WDC average finish, fastest laps, career points, DNFs, races attended, and any custom round stats you include (e.g., sick drifts in Japan).

## Deploy Without Admin

Run `./deploy.sh` to generate a `public/` folder without `admin.html`. Upload the `public/` folder to GitHub Pages.

