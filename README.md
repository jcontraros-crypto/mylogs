# Fitness Tracker Meteor App

A simple Meteor app for tracking:
- Monthly weigh-ins (up to 3 per month)
- Exercise
- Pant size
- Daily calories
- Goal weight in settings
- Homepage summary with current weight and goal weight
- Weight history graph

## Run locally

1. Unzip the project.
2. Open a terminal in the project folder.
3. Run:
   ```bash
   meteor npm install
   meteor run
   ```

## Notes

- This app uses Meteor's `autopublish` and `insecure` packages to keep setup simple.
- Data is stored in Mongo through Meteor collections.
- The weight graph is drawn with a native HTML canvas, so there are no extra chart dependencies.


If Meteor reports a missing Babel runtime, run `meteor npm install` in the app folder before starting.


Compatibility note: This package is patched for newer Meteor versions that require async Mongo calls on the server (Meteor 3 style APIs).
