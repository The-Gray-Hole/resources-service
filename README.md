# resources-service

An api service for resources management.
This package has only one class named ResourcesService. To get your resources service ready you only have to instatiate this class and call the init(), route() and start() methods as follows.

Example
```javascript
var resources = require('resources-service');

let db_uri = process.env.DB_URI;
let port = process.env.PORT;
let identity_uri = process.env.IDENTITY_URI;
let identity_secret = process.env.IDENTITY_SECRET;
let cors_withe_list = process.env.CORS_W_LIST ? process.env.CORS_W_LIST.split(",") : [];

// Free actions allow to not provides token for these actions
let free_actions = process.env.FREE_ACTIONS ? process.env.FREE_ACTIONS.split(",") : ["FINDALL", "FINDONE"];
let name = process.env.APP_NAME;

var tgh_school = new resources.ResourceService(
    identity_uri,
    identity_secret,
    db_uri,
    cors_withe_list,
    port,
    name
);

tgh_school.init().then(() => {
    tgh_school.route();
    tgh_school.start();
});

```

## Endpoints

### Global endpoints

```
/_resources
```

### Specific endpoints

```
/_resources/:_resourceId
```

### Actions

The three endpoints allow you to perform next actions:

#### For Global endpoints

```
CREATE -> POST
FINDALL -> GET
```

#### For Specific endpoints

```
FINDONE -> GET
DELETE -> DELETE
```

### Payloads

This payloads are valid for create action.

```javascript
resource_payload = {
    name: String,
    str_shema: String, // Stringified json object with the mongo shema definition
    timestamps: Boolean,
    free_actions: Array<String>
}
```

### Authentication

This module needs an [Identity Service](https://www.npmjs.com/package/identity-service) running in an accecible url, wich you must provide in the class constructor.

When you start this app, it will create a role in the identity for manage resources. You must create an user with that role, login and use the token result to create, update and delete resources.

Every time you create a resource, there will be created some roles for different access levels over that resources.
