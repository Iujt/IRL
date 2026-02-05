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
├── admin.html
├── assets
│   ├── css
│   │   └── styles.css
│   ├── img
│   │   ├── tracks
│   │   │   ├── azure.svg
│   │   │   ├── lunar.svg
│   │   │   ├── metro.svg
│   │   │   ├── montciel.svg
│   │   │   ├── portside.svg
│   │   │   └── sakhir.svg
│   │   └── archive
│   │       ├── season-1-2022.png
│   │       ├── season-2-2022.png
│   │       ├── season-3-2023.png
│   │       ├── season-4-2023.jpg
│   │       ├── season-5-2024.png
│   │       ├── season-6-2025.png
│   │       └── season-7-2025.png
│   └── js
│       ├── admin.js
│       ├── data.js
│       ├── history.js
│       ├── home.js
│       ├── race-detail.js
│       ├── races.js
│       ├── standings-calc.js
│       ├── standings.js
│       ├── stats.js
│       └── ui.js
└── data
    ├── drivers.json
    ├── points.json
    ├── races.json
    ├── seasons.json
    └── teams.json
```

## Run Locally

Option A: Open directly
- Double-click `index.html` (some browsers restrict local file fetches)

Option B: Local server (recommended)

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Weekly Race Editing

Edit `data/races.json` directly to add new rounds. Standings and stats are auto-computed from the `races.json` data using the current points system.

## Archive Page

Historical seasons are presented as official image snapshots on `archive.html`. Add or replace images in `assets/img/archive`.

## Data Editing

### Fast edit (manual)
1. Open the JSON file in `/data`.
2. Edit values (keep IDs stable).
3. Refresh the browser.

### Admin UI (download + replace)
1. Open `admin.html` in the browser.
2. Pick a JSON file from the dropdown.
3. Edit JSON in the textarea.
4. Click **Download JSON**.
5. Replace the file in `/data` with the downloaded file.

## Deployment

This is a static site. Deploy to any static host:
- GitHub Pages
- Netlify
- Vercel
- S3 or any basic hosting

Just upload the project folder. No build step required.

## Data Schema Summary

### `drivers.json`
Array of drivers.

```json
{
  "id": "d1",
  "name": "Aria Kovalenko",
  "abbreviation": "KOV",
  "number": 7,
  "country": "Ukraine",
  "color": "#e10600",
  "teamHistory": [
    {"teamId": "t1", "from": "2025-01-01", "to": null}
  ]
}
```

### `teams.json`
Array of teams.

```json
{
  "id": "t1",
  "name": "Apex Dynamics",
  "base": "Silverstone",
  "engine": "Vortex",
  "color": "#e10600"
}
```

### `points.json`
Points configuration for the current season.

```json
{
  "season": 8,
  "name": "Season 8 (2026)",
  "featurePoints": [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  "sprintPoints": [12, 10, 8, 7, 6, 5, 4, 3, 2, 1],
  "fastestLapBonus": 1,
  "fastestLapOnlyIfPoints": true
}
```

### `races.json`
Array of race objects. Each race can include sprint and feature sessions.

```json
{
  "id": "r3",
  "round": 3,
  "name": "Alpine Grand Prix",
  "date": "2026-02-02T18:00:00Z",
  "track": "Mont-Ciel Raceway",
  "circuitId": "montciel",
  "weather": "Light Rain",
  "safetyCars": 1,
  "laps": 70,
  "status": "completed",
  "sessions": {
    "sprint": {"name": "Sprint", "results": []},
    "feature": {
      "name": "Feature Race",
      "results": [
        {
          "position": 1,
          "driverId": "d1",
          "teamId": "t1",
          "time": "1:28:33.180",
          "status": "Finished",
          "gridPosition": 2,
          "penalties": [],
          "fastestLap": false
        }
      ]
    }
  }
}
```

### `seasons.json`
Archive seasons with their own points rules and rounds.

```json
{
  "id": "s1",
  "year": 2022,
  "label": "Season 1 (2022)",
  "points": {
    "featurePoints": [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    "sprintPoints": [8, 7, 6, 5, 4, 3, 2, 1],
    "fastestLapBonus": 1,
    "fastestLapOnlyIfPoints": true
  },
  "rounds": []
}
```

## Computed Standings Logic

Standings are computed dynamically from `races.json` (current season) or `seasons.json` (archive) using `assets/js/standings-calc.js`:

1. Only races with `status: "completed"` are included.
2. Points are calculated per session (sprint/feature) from the season’s points rules.
3. Fastest lap bonus is awarded **only** if the driver finishes in a points-paying position.
4. Driver standings are sorted by `points`, then `wins`, then `podiums` (feature race only).
5. Team standings sum points/wins across all drivers.
6. Position changes compare the latest standings to standings after the previous completed race.

## Future Expansion Notes

- The data layer is centralized in `assets/js/data.js` so you can swap JSON for API endpoints later.
- IDs (`driverId`, `teamId`, `raceId`) are the primary relational keys across files.
- The points system is fully configurable in `data/points.json` and per-season in `data/seasons.json`.


## Stewarding Panel

Create steward decisions in `data/stewards.json` and view them on `stewards.html`.

## Deploy Without Admin

Run `./deploy.sh` to generate a `public/` folder without `admin.html`. Upload the `public/` folder to GitHub Pages.

### `circuits.json`

Track reference data used by the race pages.

```json
{
  "id": "sakhir",
  "country": "Bahrain",
  "circuit": "Bahrain International Circuit",
  "laps": 57,
  "flag": "assets/img/flags/bahrain.png"
}
```

### `flags.json`

Central registry of flag images you can reference across drivers, teams, and circuits.

```json
{
  "id": "bahrain",
  "country": "Bahrain",
  "image": "assets/img/flags/bahrain.png"
}
```

### `team-logos.json`

Registry of team logo files that can be referenced by team IDs.

```json
{
  "id": "t1",
  "team": "Apex Dynamics",
  "logo": "assets/img/teams/apex-dynamics.png"
}
```

## Season Calendar

Use `calendar.html` for a clean season schedule view (round, track, country, date, sprint).

## Licenses

Driver license points are stored in `data/licenses.json` and displayed on `licenses.html`.
