# [3.0.0-rc1](https://github.com/socketio/socket.io/compare/2.3.0...3.0.0-rc1) (2020-10-13)


### Features

* add ES6 module export ([8b6b100](https://github.com/socketio/socket.io/commit/8b6b100c284ccce7d85e55659e3397f533916847))
* do not reuse the Engine.IO id ([2875d2c](https://github.com/socketio/socket.io/commit/2875d2cfdfa463e64cb520099749f543bbc4eb15))
* remove Server#set() method ([029f478](https://github.com/socketio/socket.io/commit/029f478992f59b1eb5226453db46363a570eea46))
* remove Socket#rooms object ([1507b41](https://github.com/socketio/socket.io/commit/1507b416d584381554d1ed23c9aaf3b650540071))
* remove the 'origins' option ([a8c0600](https://github.com/socketio/socket.io/commit/a8c06006098b512ba1b8b8df82777349db486f41))
* remove the implicit connection to the default namespace ([3289f7e](https://github.com/socketio/socket.io/commit/3289f7ec376e9ec88c2f90e2735c8ca8d01c0e97))
* throw upon reserved event names ([4bd5b23](https://github.com/socketio/socket.io/commit/4bd5b2339a66a5a675e20f689fff2e70ff12d236))


### BREAKING CHANGES

* the 'origins' option is removed

Before:

```js
new Server(3000, {
  origins: ["https://example.com"]
});
```

The 'origins' option was used in the allowRequest method, in order to
determine whether the request should pass or not. And the Engine.IO
server would implicitly add the necessary Access-Control-Allow-xxx
headers.

After:

```js
new Server(3000, {
  cors: {
    origin: "https://example.com",
    methods: ["GET", "POST"],
    allowedHeaders: ["content-type"]
  }
});
```

The already existing 'allowRequest' option can be used for validation:

```js
new Server(3000, {
  allowRequest: (req, callback) => {
    callback(null, req.headers.referer.startsWith("https://example.com"));
  }
});
```

* Socket#rooms is now a Set instead of an object

* Namespace#connected is now a Map instead of an object

* there is no more implicit connection to the default namespace:

```js
// client-side
const socket = io("/admin");

// server-side
io.on("connect", socket => {
  // not triggered anymore
})

io.use((socket, next) => {
  // not triggered anymore
});

io.of("/admin").use((socket, next) => {
  // triggered
});
```

* the Server#set() method was removed

This method was kept for backward-compatibility with pre-1.0 versions.

