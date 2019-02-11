const Fusia = require("./modules/Fusia"); //or require("fusia");
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