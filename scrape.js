require('dotenv').config();
const fetch = require('node-fetch');
const he = require('he');
const mongoose = require('mongoose');
const Character = require('./models/Character');

(async function () {
    // Start timer
    const start = new Date().getTime();
    console.log('Starting character data scrape...');

    // Create masterlist
    const characterMasterlist = [];

    // Create list of promise objects
    const promises = [];
    for (let i = 0; i < 26; i++) {
        promises.push(getCharacters(String.fromCharCode(65 + i)));
    }

    // Wait for all promises to resolve
    const results = await Promise.all(promises);

    // Flatten the results
    results.forEach((result) => {
        characterMasterlist.push(...result);
    });

    // Sort results
    characterMasterlist.sort((a, b) => a.name.localeCompare(b.name));
    
    // End timer and start new timer
    const end = new Date().getTime();
    const duration = (end - start) / 1000;

    // Log data to user
    console.log(`${characterMasterlist.length} characters scraped in ${duration} seconds!`);

    // Connect mongoose to server
    const mongoURL = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@${process.env.MONGO_URL}/data?retryWrites=true&w=majority`;
    mongoose.connect(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });

    // Open database connection
    const db = mongoose.connection;
    db.on('error', (error) => {
        console.error(error);
        process.exit(1);
    });
    db.once('open', async () => {
        console.log('Connected to mongodb database!');

        // Drop the old database
        try {
            await mongoose.connection.dropCollection('anime-db');
            console.log('Dropped old database!');
        } catch (err) {
            console.error(err);
            process.exit(1);
        }

        // Insert characters into database
        console.log('Uploading characters to database (this may take a while)...');
        Character.insertMany(characterMasterlist, (error) => {
            if (error) {
                console.error(error);
                process.exit(1);
            }

            // End timer and tell user
            const end2 = new Date().getTime();
            const duration2 = (end2 - end) / 1000;
            console.log(`Inserted characters into database in ${duration2} seconds!`);
            process.exit(0);
        });
    });
})();

/**
 * Gets a list of characters from a given letter
 *
 * @param {string} letter Letter to get characters for
 * @returns {Promise<AnimeCharacter[]>} Characters for the given letter and page
 */
async function getCharacters(letter) {
    let page = 50;
    const letterList = [];
    let html = '';

    while (isValid(html)) {
        html = await fetch(
            `https://myanimelist.net/character.php?letter=${letter}&show=${page}`
        ).then((res) => res.text());
        
        // Check if the page is throttled
        while (isThrottled(html)) {
            console.log(
                `${letter} | Throttled... sleeping for 10 seconds! Verify non-bot status in browser: https://myanimelist.net/`
            );
            await sleep(10000);
            html = await fetch(
                `https://myanimelist.net/character.php?letter=${letter}&show=${page}`
            ).then((res) => res.text());
        }

        // Parse the characters on the page and add it to the list
        letterList.push(...parseTable(html));
        console.log(`${letter} | page ${page / 50}`);
        page += 50;
    }

    return letterList;
}

/**
 * Checks to see if the current page is valid
 *
 * @param {string} html HTML string
 * @returns {boolean} True if the current page is valid
 */
function isValid(html) {
    return !html.includes('No results found');
}

/**
 * Checks to see if the current page is throttled bc too many bot requests.
 * This can be easily bypassed by manually telling the site that it is a human!
 *
 * @param {string} html HTML string
 * @returns {boolean} True if the current page is throttled
 */
function isThrottled(html) {
    return html.includes('We are temporarily restricting site connections due to heavy access.');
}

/**
 * Extract characters from the table
 *
 * @param {string} html Input HTML
 * @returns {AnimeCharacter[]} List of characters
 */
function parseTable(html) {
    const matches = [
        ...html.matchAll(
            /<tr>.*?<a href="(.*?)".*?data-src="(.*?)".*?<a href="\1">(.*?)<\/a>.*?small>(?:(?: <div>)| )(.*?):.*?>(.*?)<.*?<\/tr>/gs
        ),
    ];
    return matches.map(([, url, img, name, media, mediaName]) => ({
        id: getId(url),
        url,
        img: getImgUrl(img),
        name: he.decode(breakName(name)),
        media,
        mediaName: he.decode(mediaName),
    }));
}

/**
 * Gets the full-size image from the thumbnail URL
 *
 * @param {string} str Thumbnail URL
 * @returns {string} Full-size image URL
 */
function getImgUrl(str) {
    return str === 'https://cdn.myanimelist.net/images/questionmark_23.gif'
        ? null
        : str.replace(
              /https:\/\/cdn\.myanimelist\.net\/r\/42x62\/(.*)\..*/g,
              'https://cdn.myanimelist.net/$1.jpg'
          );
}

/**
 * Returns the ID of the character, extracted from their URL string
 *
 * @param {string} str Input string
 * @returns {number} Numeric ID of the character
 */
function getId(str) {
    return Number.parseInt(str.replace(/https:\/\/myanimelist\.net\/character\/(.*?)\/.*/g, '$1'));
}

/**
 * Turns all "Last, First" names into "First Last"
 * and ignores names that do not contain a comma
 *
 * @param {string} str Input string
 * @returns {string} First Last name string
 */
function breakName(str) {
    const [last, ...first] = str.split(', ');
    return `${first} ${last}`.trim();
}

/**
 * Pauses execution for some time
 *
 * @param {number} ms Time in milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class AnimeCharacter {
    constructor(url, img, name, media, mediaName) {
        this.id = id;
        this.url = url;
        this.img = img;
        this.name = name;
        this.media = media;
        this.mediaName = mediaName;
    }
}
