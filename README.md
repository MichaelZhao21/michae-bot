# Michae Bot

Self-hosted discord bot that allows you to roll for random anime characters! (WIP)

## Hosting

Host the bot on your own server! This can be run with something like Heroku. Simply clone the repo, update the environmental variables, and run:

### .env File

```
TOKEN=[Discord bot token]
MONGO_USER=[MongoDB Username]
MONGO_PASS=[MongoDB Password]
MONGO_URL=[MongoDB URL]
```

### Running

```
yarn install
yarn start
```

and the bot should be running! You may want to use PM2 or some other service to keep it running in the background.
