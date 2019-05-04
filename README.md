# Fusia
[![npm](https://img.shields.io/npm/v/fusia.svg)]()
[!["Monthly Download"](https://img.shields.io/npm/dm/fusia.svg)](https://npmjs.org/package/fusia)
[![MIT license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/ShaunLWM/fusia/blob/master/LICENSE)

A simple, Promise-based NodeJS web API for Instagram

## Usage
```
npm install fusia
or
yarn add fusia
```

```
const Fusia = require('fusia');
let fusia = new Fusia({/* options */});
```

## Example
```
const Fusia = require("fusia");
let fusia = new Fusia({ username: "", password: "", debug: true });

(async () => {
    try {
        await fusia.login();
        console.log(fusia.userId);
        let feed = await fusia.userFeed({ userId: fusia.userId });
        console.log(feed);
        let followings = await fusia.userFollowings({ userId: fusia.userId });
        console.log(followings);
        await fusia.logout();
    } catch (error) {
        console.log(error);
    }
})();
```

## Options
`new Fusia({options})`
* `options` (object): All options are optional
  * `username` (string): username for account
  * `password` (string): password for account
  * `debug` (boolean, default `false`): whether to print out debug information

## Methods

#### Account
* `isLoggedIn()` - Checks if user is logged in
* `login()` - Login with supplied username and passwor
* `logout()` - Logout of account

#### Methods
Most methods require login. `=` denotes optional parameters. For example, `cursor` and `count` can be ignored.

* `fetchUser({username, raw = false})` - Fetch profile information. raw returns unparsed data.
* `timelineFeed({ count = 12, cursor = null })` - Get logged-in user's timeline feed.
* `taggedUserFeed({ userId, count = 12, cursor = null })` - Get the tagged feed for the specified user ID
* ` userFeed({ userId, count = 12, cursor = null })` - Get user feed
* `mediaInfo({ shortCode })` - Get information about the media.
* `mediaComments({ shortCode, count = 16, cursor = null })` - Get media comments. **Login Required**
* `mediaLikers({ shortCode, count = 24, cursor = null })` - Get media likers.
* `userFollowings({ userId, count = 10, cursor })` - Get user's followings.
* `userFollowers({ userId, count = 10, cursor })` - Get user's followers. 
* `follow({ id, isFollow = true })` - Follow or unfollow userId.
* `editProfile(opts)` - Edit Profile with given information.

    * `first_name: "",
            email: "",
            username: "",
            phone_number: "",
            gender: null,
            biography: "",
            external_url: ""`
* `updateProfilePicture(img)` - Upload profile image. `img` is the absolute path of the image on your server
* `like(id, isLike = true)` - Like or unlike a media
* `upload({img, caption = ""})` - Upload media with caption
* `deletePost(mediaId)` - Delete post from your profile
* `deleteComment({mediaId, commentId})` - Delete comment from supplied mediaId
* `postComment({ mediaId, commentText })` - Post new comment on media
* `search(text)` - Do a general search on Instagram
* `searchTagFeed({ tag, count = 16, cursor = null })` - Search for feeds with given tag
* `searchLocationFeed({ locationId, count = 16, cursor = null })` - Search for feeds with given location id
* `getTagStoryFeed(tag_names)` - Get the stories feed for the specified tag
* `getLocationStoryFeed(location_ids)` - Get the stories feed for the specified location ID

# License
MIT - Shaun (2019)