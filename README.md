# Michae Bot

Self-hosted discord bot that allows you to roll and date random anime characters! (WIP)

## Hosting

Host the bot on your own server! This can be run with something like Heroku. Simply clone the repo, update the environmental variables, and run the following command.

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

## Getting Data

So the data that is used is sourced from 2 places. First, we scrape all the character data from MyAnimeList and store it in our own database. Simply run the `yarn scrape` command with the correct environmental variables and it should scrape all the character data into your MongoDB database. This might take a little bit, and you might be throttled by MAL. If you are throttled, simply go to the site and verify your human stance. The program will continue to run after that. This process will vary depending on your connection speed, but it took me ~**420 seconds** to scrape/parse (~280 sec) and save the data (MongoDB Atlas with my okay wifi = ~140 sec). At the time of writing (12/28/2021), there are **75779 characters**, taking up a whole **17.49 MB** in MongoDB. This will vary as new animes are added, but it's a good idea to update this from time-to-time. The script will automatically drop the old data, so that shouldn't be an issue.
