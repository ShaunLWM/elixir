const FileCookieStore = require("tough-cookie-filestore");
const fs = require("fs-extra");
const request = require("request");
const qs = require("query-string");

let GRAPHQL_API_URL = "https://www.instagram.com/graphql/query/";

class Fusia {
    /**
     * Creates an instance of Fusia.
     *
     * @param {*} { username, password, cookieFile = "cookies.json", debug = false }
     * @memberof Fusia
     */
    constructor({ username, password, cookieFile = "cookies.json", debug = false }) {
        this.username = username;
        this.password = password;
        this._userId = null;
        this.cookieFile = cookieFile;
        this.debug = debug;
        fs.ensureFileSync(this.cookieFile);
        let j = request.jar(new FileCookieStore(this.cookieFile));
        this.request = request.defaults({ jar: j });
        this.csrfToken = null;
        this.rolloutHash = 1;
        this.defaultRequestOptions = {
            headers: {
                "Accept-Language": "en-US,en-SG;q=0.9,en;q=0.8",
                "Connection": "keep-alive",
                "Host": "www.instagram.com",
                "Origin": "https://www.instagram.com",
                "Referer": "https://www.instagram.com",
                "User-Agent": "Mozilla/5.0 (Linux; U; Android 2.2; en-gb; GT-P1000 Build/FROYO) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1",
                "X-Instagram-AJAX": 1,
                "X-Requested-With": "XMLHttpRequest"
            }
        };
    }

    /**
     * Debug console
     *
     * @param {*} args
     * @memberof Fusia
     */
    debugLog(...args) {
        if (this.debug) console.log("[@]", ...args);
    }

    /**
     * Set userId
     *
     * @memberof Fusia
     */
    set userId(id) {
        this._userId = id;
    }

    /**
     * Get userId
     *
     * @memberof Fusia
     */
    get userId() {
        return this._userId;
    }

    /**
     * Check if you're logged in
     *
     * @returns boolean if user is logged in
     * @memberof Fusia
     */
    isLoggedIn() {
        return this.csrfToken !== null;
    }

    /**
     *
     * The web API uses the numeric media ID only, and not the formatted one where it's XXXXX_YYY
     * @param {*} id
     * @returns
     * @memberof Fusia
     */
    sanitiseMediaId(id) {
        if (/[0-9]+_[0-9]+/g.test(id)) {
            return id.split("_")[0];
        }

        return id;
    }
    /**
     * Set rollouthash on header
     *
     * @memberof Fusia
     */
    setRolloutHash() {
        this.defaultRequestOptions["headers"]["X-Instagram-AJAX"] = this.rolloutHash;
    }

    /**
     *
     * Login to account using username & password given.
     * @memberof Fusia
     */
    async login() {
        try {
            let homepage = await this.fetchHomepage();
            this.debugLog("Fetching homepage..");
            let parsedConfig = this.parseSharedData(homepage);
            this.debugLog("Parsing..");
            if (parsedConfig === -1) {
                throw new Error("Failed to parse shared data..");
            }

            if (!homepage.includes(this.username)) {
                this.debugLog("Logging in for the first time..");
                let options = Object.assign(this.defaultRequestOptions);
                options["url"] = "https://www.instagram.com/accounts/login/ajax/";
                this.rolloutHash = parsedConfig["rollout_hash"];
                this.setRolloutHash();
                this.csrfToken = parsedConfig["config"]["csrf_token"];
                options["headers"]["X-CSRFToken"] = this.csrfToken;
                this.debugLog(`Login Token: ${this.csrfToken}`);
                options["form"] = { "username": this.username, "password": this.password };
                this.debugLog("Trying to login..");
                let submitLogin = await this.fetchPage({
                    options,
                    isPost: true
                });

                let result = JSON.parse(submitLogin);
                this._userId = result["userId"];
                if (typeof result["authenticated"] === "undefined" || !result["authenticated"]) {
                    throw new Error(result);
                }

                homepage = await this.fetchHomepage();
                parsedConfig = this.parseSharedData(homepage);
            }

            this.csrfToken = parsedConfig["config"]["csrf_token"];
            this._userId = parsedConfig["config"]["viewerId"];
            this.debugLog(`Final Token: ${this.csrfToken}`);
            return this.csrfToken;
        } catch (error) {
            console.error(`_login ${error}`);
            throw new Error(error);
        }
    }

    /**
     *
     * Logout of Instagram web instance
     * @memberof Fusia
     */
    async logout() {
        try {
            let options = Object.assign(this.defaultRequestOptions);
            options["url"] = "https://www.instagram.com/accounts/logout/";
            options["headers"]["X-CSRFToken"] = this.csrfToken;
            options["form"] = { csrfmiddlewaretoken: this.csrfToken };
            await this.fetchPage({ options, isPost: true, ignoreRedirection: true });
            fs.removeSync(this.cookieFile);
            return true;
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     *
     * Parse share_data on web body
     * @param {*} body
     * @returns csrf token
     * @memberof Fusia
     */
    parseCSRFToken(body) {
        let parsed = this.parseSharedData(body);
        if (parsed === -1) {
            return reject("Failed to parse shared data..");
        }

        return parsed["config"]["csrf_token"];
    }

    /**
     *
     *  Parse shared_data on web body
     * @param {*} body
     * @returns JSON representation of the given data
     * @memberof Fusia
     */
    parseSharedData(body) {
        let regexr = /window._sharedData = ({[^\n]*});/g;
        let match = regexr.exec(body);
        if (match === null || match.length < 1) {
            return -1;
        }

        return JSON.parse(match[1]);
    }

    parseAdditionalSharedData(body) {
        let regexr = /window.__additionalDataLoaded\('feed',({[^\n]*})\);/g;
        let match = regexr.exec(body);
        if (match === null || match.length < 1) {
            return -1;
        }

        return JSON.parse(match[1]);
    }

    fetchPage({ options, isPost = false, printHeader = false, ignoreRedirection = false }) {
        return new Promise((resolve, reject) => {
            if (printHeader) this.debugLog(options);
            if (isPost) {
                return this.request.post(options, function (error, response, body) {
                    if (error) {
                        return reject(error);
                    }

                    if (response.statusCode !== 200 && !ignoreRedirection) {
                        return reject(response.statusCode);
                    }

                    return resolve(body);
                });
            }

            return this.request(options, function (error, response, body) {
                if (error) {
                    return reject(error);
                }

                if (response.statusCode !== 200 && !ignoreRedirection) {
                    return reject(response.statusCode);
                }

                return resolve(body);
            });
        });

    }

    async fetchUser({ username = null, raw = false }) {
        let url = `https://www.instagram.com/${username}/${(raw) ? "?__a=1" : ""}`;
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = url;
        try {
            if (raw) options["json"] = true;
            let body = await this.fetchPage({ options });
            let requestedUser = null;
            if (raw) {
                requestedUser = body["graphql"]["user"];
            } else {
                let parsed = this.parseSharedData(body);
                requestedUser = parsed["entry_data"]["ProfilePage"][0]["graphql"]["user"];
            }

            return requestedUser;
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get logged-in user's timeline feed.
     *
     * @param {*} { count = 12, cursor = null }
     * @returns
     * @memberof Fusia
     */
    async timelineFeed({ count = 12, cursor = null }) {
        if (count > 50) {
            this.debugLog("timelineFeed count defaulting to 12");
            count = 12;
        }

        let variables = {
            fetch_media_item_count: count,
            fetch_comment_count: 4,
            fetch_like: 10,
            has_stories: false
        }

        if (cursor !== null) {
            variables["fetch_media_item_cursor"] = cursor;
        }

        let query = {
            query_hash: "13ab8e6f3d19ee05e336ea3bd37ef12b",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["user"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["user"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get the tagged feed for the specified user ID
     *
     * @param {*} { count = 12, cursor = null }
     * @returns
     * @memberof Fusia
     */
    async taggedUserFeed({ userId, count = 12, cursor = null }) {
        if (count > 50) {
            this.debugLog("taggedUserFeed count defaulting to 12");
            count = 12;
        }

        let variables = {
            id: userId,
            first: count
        }

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "e31a871f7301132ceaab56507a66bbb7",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["user"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["user"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get user feed
     *
     * @param {*} { userId, count = 12, cursor = null }
     * @memberof Fusia
     */
    userFeed({ userId, count = 12, cursor = null }) {
        if (count > 50) {
            this.debugLog("userfeed count defaulting to 12");
            count = 12;
        }

        let variables = {
            id: userId,
            first: count
        }

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "e7e2f4da4b02303f74f0841279e52d76",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        return this.fetchPage({ options });
    }

    /**
     * Get information about the media. Login required
     *
     * @param {*} { shortCode }
     * @returns
     * @memberof Fusia
     */
    async mediaInfo({ shortCode }) {
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `https://www.instagram.com/p/${shortCode}/?__a=1`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["graphql"] === "undefined" || typeof parsed["graphql"]["shortcode_media"] === "undefined") {
                throw new Error("404 Not Found");
            }

            return parsed["graphql"]["shortcode_media"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get media comments. Login required
     *
     * @param {*} { shortCode, count = 16, cursor = null }
     * @returns
     * @memberof Fusia
     */
    async mediaComments({ shortCode, count = 16, cursor = null }) {
        if (count > 50) {
            this.debugLog("mediaComments count defaulting to 12");
            count = 12;
        }

        let variables = {
            shortcode: shortCode,
            first: count
        };

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "f0986789a5c5d17c2400faebf16efd0d",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["shortcode_media"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["shortcode_media"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get media likers
     *
     * @param {*} { shortCode, count = 24, cursor = null }
     * @returns
     * @memberof Fusia
     */
    async mediaLikers({ shortCode, count = 24, cursor = null }) {
        let variables = {
            shortcode: shortCode
        };

        if (cursor !== null) {
            if (count > 50) {
                this.debugLog("mediaLikers count defaulting to 12");
                count = 12;
            }

            variables["after"] = cursor;
        } else {
            if (count > 50) {
                this.debugLog("mediaLikes count defaulting to 12");
                count = 24;
            }
        }

        variables["first"] = count;
        let query = {
            query_hash: "e0f59e4a1c8d78d0161873bc2ee7ec44",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["shortcode_media"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["shortcode_media"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get user's followings. Login required.
     *
     * @param {*} { userId, count = 10, cursor }
     * @returns
     * @memberof Fusia
     */
    async userFollowings({ userId, count = 10, cursor }) {
        if (count > 50) {
            this.debugLog("userFollowings count defaulting to 10");
            count = 10;
        }

        let variables = {
            id: userId,
            first: count
        };

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "c56ee0ae1f89cdbd1c89e2bc6b8f3d18",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["user"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["user"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get a user's followers. Login required.
     *
     * @param {*} { userId, count = 10, cursor }
     * @returns
     * @memberof Fusia
     */
    async userFollowers({ userId, count = 10, cursor }) {
        if (count > 50) {
            this.debugLog("userFollowings count defaulting to 10");
            count = 10;
        }

        let variables = {
            id: userId,
            first: count
        };

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "7dd9a7e2160524fd85f50317462cff9f",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["user"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["user"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get homepage. Used for retreiving csrf token
     *
     * @returns
     * @memberof Fusia
     */
    fetchHomepage() {
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = "https://www.instagram.com/";
        if (this.csrfToken !== null) {
            options["headers"]["X-CSRFToken"] = this.csrfToken;
        }

        return this.fetchPage({ options });
    }

    /**
     *  (Un)Follow user
     * 
     * @param {*} { id, isFollow = true }
     * @returns
     * @memberof Fusia
     */
    follow({ id, isFollow = true }) {
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `https://www.instagram.com/web/friendships/${id}/${((isFollow) ? "follow" : "unfollow")}/`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        return this.fetchPage({ options, isPost: true });
    }

    /**
     * Edit profile information
     * Compulsory: {
     *  first_name: String,
     *  email: String,
     *  username: String,
     *  gender: Integer - 1/2,
     *  biography: String
     * }
     * 
     * @returns
     * @memberof Fusia
     */
    editProfile(opts) {
        let defaultProfile = {
            first_name: "",
            email: "",
            username: "",
            phone_number: "",
            gender: null,
            biography: "",
            external_url: "",
            chaining_enabled: "on"
        };

        let profile = Object.assign(defaultProfile, opts);
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = "https://www.instagram.com/accounts/edit/";
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        toptions["headers"]["Referrer"] = "https://www.instagram.com/accounts/edit/";
        toptions["headers"]["Content-Length"] = JSON.stringify(profile).length;
        toptions["headers"]["Content-Type"] = "application/x-www-form-urlencoded";
        options["form"] = profile;
        return this.fetchPage({ options, isPost: true, printHeader: true });
    }

    /**
     * Upload profile image
     * img: path to image
     * 
     * @param {*} [img=null]
     * @returns
     * @memberof Fusia
     */
    updateProfilePicture(img = null) {
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = "https://www.instagram.com/accounts/web_change_profile_picture/";
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        if (img !== null) {
            options["formData"] = {
                profile_pic: fs.createReadStream(img)
            };
        }

        return this.fetchPage({ options, isPost: true });
    }

    /**
     * Like a media
     *
     * @param {*} id
     * @param {boolean} [isLike=true]
     * @returns
     * @memberof Fusia
     */
    like(id, isLike = true) {
        let options = Object.assign(this.defaultRequestOptions);
        let mediaId = this.sanitiseMediaId(id);
        options["url"] = `https://www.instagram.com/web/likes/${mediaId}/${(isLike) ? "like" : "unlike"}/`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        return this.fetchPage({ options, isPost: true });
    }

    /**
     * Upload media to Instagram
     * img: path to media
     * 
     * @param {*} { img, caption = "" }
     * @returns
     * @memberof Fusia
     */
    async upload({ img, caption = "" }) {
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = "https://www.instagram.com/create/upload/photo/";
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        options["formData"] = {
            upload_id: Math.round((new Date()).getTime()),
            photo: fs.createReadStream(img),
            media_type: 1
        };


        let parseInitial = await this.fetchPage({ options, isPost: true });
        let upload_id = parseInitial["upload_id"];
        options["url"] = "https://www.instagram.com/create/configure/";
        options["form"] = {
            upload_id,
            caption
        };

        delete options["formData"];
        return this.fetchPage({ options, isPost: true });
    }

    /**
     * Delete a comment. Login required.
     *
     * @param {*} { mediaId, commentId }
     * @returns "{"status": "ok"}"
     * @memberof Fusia
     */
    deleteComment({ mediaId, commentId }) {
        mediaId = this.sanitiseMediaId(mediaId);
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `https://www.instagram.com/web/comments/${mediaId}/delete/${commentId}/`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        return this.fetchPage({ options, isPost: true });
    }

    /**
     * Post a new comment. Login required.
     *
     * @param {*} { mediaId, commentText }
     * @returns "{
                    "created_time": 1483096000,
                    "text": "This is a comment",
                    "status": "ok",
                    "from": {
                        "username": "somebody",
                        "profile_picture": "..",
                        "id": "1234567890",
                        "full_name": "Somebody"
                    },
                    "id": "1785800000"
                }"
     * @memberof Fusia
     */
    postComment({ mediaId, commentText }) {
        if (commentText.length > 300) {
            throw new Error("The total length of the comment cannot exceed 300 characters.");
        }

        if (/[a-z]/gi.test(commentText) && commentText === commentText.toUpperCase()) {
            throw new Error("The comment cannot consist of all capital letters.");
        }

        if (/#[^#]+\b/gu.exec(commentText).length > 4) {
            throw new Error("The comment cannot contain more than 4 hashtags.");
        }

        if (/\bhttps?:\/\/\S+\.\S+/g.exec(commentText).length > 1) {
            throw new Error("The comment cannot contain more than 1 URL.");
        }

        mediaId = this.sanitiseMediaId(mediaId);
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `https://www.instagram.com/web/comments/${media_id}/add/`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["form"] = { "comment_text": commentText }
        return this.fetchPage({ options, isPost: true });
    }

    /**
     * General search
     *
     * @param {*} text
     * @memberof Fusia
     */
    search(text) {
        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `https://www.instagram.com/web/search/topsearch/?query=${text}`;
        options["json"] = true;
        return this.fetchPage({ options });
    }

    /**
     * Get a tag feed.
     *
     * @param {*} { tag, count = 16, cursor = null }
     * @returns
     * @memberof Fusia
     */
    async searchTagFeed({ tag, count = 16, cursor = null }) {
        if (count > 50) {
            this.debugLog("searchTagFeed count defaulting to 16");
            count = 16;
        }

        let variables = {
            tag_name: tag.toLowerCase(),
            first: count
        };

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "faa8d9917120f16cec7debbd3f16929d",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["hashtag"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["hashtag"];
        } catch (error) {
            throw new Error(error);
        }
    }

    /**
     * Get a location feed.
     *
     * @param {*} { locationId, count = 16, cursor = null }
     * @returns
     * @memberof Fusia
     */
    async searchLocationFeed({ locationId, count = 16, cursor = null }) {
        if (count > 50) {
            this.debugLog("searchLocationFeed count defaulting to 16");
            count = 16;
        }

        let variables = {
            id: locationId,
            first: count
        };

        if (cursor !== null) {
            variables["after"] = cursor;
        }

        let query = {
            query_hash: "ac38b90f0f3981c42092016a37c59bf7",
            variables: JSON.stringify(variables)
        }

        let options = Object.assign(this.defaultRequestOptions);
        options["url"] = `${GRAPHQL_API_URL}?${qs.stringify(query)}`;
        options["headers"]["X-CSRFToken"] = this.csrfToken;
        options["json"] = true;
        try {
            let parsed = await this.fetchPage({ options });
            if (typeof parsed["data"] === "undefined" || typeof parsed["data"]["location"] === "undefined" || parsed["status"] !== "ok") {
                throw new Error("404 Not Found");
            }

            return parsed["data"]["location"];
        } catch (error) {
            throw new Error(error);
        }
    }
}

module.exports = Fusia;