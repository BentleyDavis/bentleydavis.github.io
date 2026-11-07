[![Netlify Status](https://api.netlify.com/api/v1/badges/d6ba0488-6c48-4fc9-89dd-1e129366c0e3/deploy-status)](https://app.netlify.com/sites/bentleydavis/deploys)

## Website

This repository contains the Eleventy website, built and hosted by Netlify.
Firebase Hosting and GitHub Pages are not used.

Use Node.js 24 (see [.nvmrc](.nvmrc)), then install dependencies with `npm ci`.
Run `npm run build` for the production build, or `npm start` for local
development. Run `npx tsc --noEmit` to type-check the content tooling.

## Personal apps

The apps and their Firebase backend, database documentation, and Tasker code
live in the private [personal-apps repository](https://github.com/BentleyDavis/personal-apps).
The apps are hosted at [apps.bentleydavis.com](https://apps.bentleydavis.com).
They are built and deployed independently of this website.

The Firebase ignore rules remain to protect local backend environment files
left over from the move. Eleventy excludes that local backend directory from
the website build.
