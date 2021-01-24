import { MongoModel } from 'rest-mongoose';
import { MongoController, valid_actions } from 'rest-mongoose';
import { MongoRouter } from 'rest-mongoose';
import { urlencoded, json } from 'body-parser';
import { Types, connect, SchemaDefinition } from 'mongoose';
import { Auth } from 'rest-mongoose';
import { sign } from 'jsonwebtoken';
import { Router } from 'express';

var axios = require('axios').default;
var cors = require('cors');

var RESOURCES_PERM = "_to_manage_resources";
var RESOURCES_ADMIN_ROLE = "resources_admin";

interface Resource {
    title: string,
    model: MongoModel,
    ctl: MongoController,
    router: MongoRouter,
    auth: Auth
}

export class ResourcesService {
    private _resources: Array<Resource> = [];

    private _app: any;
    private _app_name: string;
    private _port: Number;
    private _identity: string;
    private _identity_secret: string;
    private _resources_model: MongoModel;
    private _resources_ctl: MongoController;
    private _resources_router: MongoRouter | null = null;
    private _resources_auth: Auth | null = null;

    constructor(identity_url: string,
                identity_secret: string,
                db_url: string,
                cors_white_list: Array<string>,
                port?: Number,
                app_name?: string) {

        this._identity = identity_url; 
        this._identity_secret = identity_secret; 
        this._app_name = app_name || "My Resource API";
        this._port = port || 8000;

        this._resources_model = new MongoModel(
            "_resource",
            {
                name: {
                    type: String,
                    unique: true,
                    required: true
                },
                str_shema: {
                    type: String,
                    unique: false,
                    required: true
                },
                timestamps: {
                    type: Boolean,
                    unique: false,
                    required: true
                },
                free_actions: [{
                    type: String,
                    unique: false,
                    required: false
                }]
            },
            true
        );

        this._resources_ctl = new MongoController(
            this._resources_model,
            ["CREATE", "FINDALL", "FINDONE", "DELETE"]
        );

        var corsOptions = {
            origin: function (origin: any, callback: any) {
                if (cors_white_list.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error(`Origin ${origin} is not allowed by CORS`));
                }
            }
        }

        this._app = require('express')();
        this._app.use(urlencoded({ extended: true }));
        this._app.use(json());
        this._app.use(cors_white_list.length == 0 ? cors() : cors(corsOptions));

        connect(db_url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useFindAndModify: false,
            useCreateIndex: true
        })
        .then( () => {
            console.log("Successfully connected to database");    
        })
        .catch( err => {
            console.log('Could not connect to the database. Exiting now...', err);
            process.exit();
        });
    }

    public async init() {
        var res_serv = this;

        let created = await this.create_permission(RESOURCES_PERM);
        if(!created) return null;

        let permissions = await this.get_permissions();
        if(!permissions) return null;

        let resources_admin_perm = permissions.filter(function(perm: any) {
            return perm.title == RESOURCES_PERM;
        })[0]._id;

        created = await this.create_role(RESOURCES_ADMIN_ROLE, [resources_admin_perm]);
        if(!created) return null;

        this._resources_auth = new Auth(
            async function(token: string, action: string) {
                return await res_serv.check_permission(token, resources_admin_perm);
            },
            []
        );
        this._resources_router = new MongoRouter(this._app, this._resources_ctl, this._resources_auth);

        this._resources_model.model.find().then(function (resources: any) {
            for(let res of resources) {
                try {
                    let shema = JSON.parse(res.str_shema);
                    res_serv.add_resource(
                        res.name,
                        shema,
                        res.timestamps,
                        res.free_actions
                    ).then((ok: any) => {
                        if(!ok) {
                            console.log("Error adding resource");
                        }
                    }).catch((err: any) => {
                        console.log(`Error adding resource: ${err}`);
                    });
                } catch {
                    console.log(`Bad shema string ${res.str_shema}`);
                }
            }
        });

        return true;
    }

    public route() {
        var res_serv = this;

        this._app.get('/', (request: any, response: any) => {
            request;
            response.json({
                "message": `Welcome to test ${this._app_name}.`
            });
        });

        if(this._resources_router) {
            this._resources_router.route(function(action: string, data: any) {
                switch (action) {
                    case "CREATE":
                        let shema = JSON.parse(data.str_shema);
                        res_serv.add_resource(
                            data.name,
                            shema,
                            data.timestamps,
                            data.free_actions
                        );
                        break;
                    case "DELETE":
                        res_serv.remove_resource(data.name);
                }
            });
        } else {
            console.log("Null resources router.");
        }
    }

    public start() {
        this._app.listen(this._port, () => {
            console.log(`Server is listening on port ${String(this._port)}`);
        });
    }

    public async add_resource(title: string,
                              shema: SchemaDefinition,
                              timestamps: boolean,
                              free_actions?: Array<string>) {
        if(title == "_resources") return false;

        var resource_model = new MongoModel(title, shema, timestamps);
        var resource_ctl = new MongoController(resource_model, valid_actions);
        var res_serv = this;

        var roles = await this.get_roles();
        if(!roles) return null;

        var new_permissions = [
            `to_get_${title}`,
            `to_create_${title}`,
            `to_update_${title}`,
            `to_delete_${title}`,
        ]

        for(let i = 0; i < new_permissions.length; i++) {
            let resp = await this.create_permission(new_permissions[i]);
            if(!resp) return null;
        }

        let permissions = await this.get_permissions();
        if(!permissions) return null;

        var get_perm_id = "";
        var create_perm_id = "";
        var update_perm_id = "";
        var delete_perm_id = "";

        for(let i = 0; i < permissions.length; i++) {
            if(permissions[i].title == new_permissions[0]) {
                get_perm_id = permissions[i]._id;
            }
            if(permissions[i].title == new_permissions[1]) {
                create_perm_id = permissions[i]._id;
            }
            if(permissions[i].title == new_permissions[2]) {
                update_perm_id = permissions[i]._id;
            }
            if(permissions[i].title == new_permissions[3]) {
                delete_perm_id = permissions[i]._id;
            }
        }

        let new_roles = [
            {
                title: `${title}_viewer`,
                permissions: [
                    get_perm_id
                ]
            },
            {
                title: `${title}_writer`,
                permissions: [
                    get_perm_id,
                    create_perm_id,
                    update_perm_id
                ]
            },
            {
                title: `${title}_manager`,
                permissions: [
                    get_perm_id,
                    create_perm_id,
                    update_perm_id,
                    delete_perm_id
                ]
            }
        ]

        for(let i = 0; i < new_roles.length; i++) {
            let resp = this.create_role(new_roles[i].title, new_roles[i].permissions);
            if(!resp) return null;
        }

        var auth = new Auth(
            async function(token: string, action: string) {
                var permission = "";
                switch(action) {
                    case 'FINDALL':
                        permission = get_perm_id;
                        break;
                    case 'FINDONE':
                        permission = get_perm_id;
                        break;
                    case 'CREATE':
                        permission = create_perm_id;
                        break;
                    case 'UPDATE':
                        permission = update_perm_id;
                        break;
                    case 'DELETE':
                        permission = delete_perm_id;
                        break;
                }

                return await res_serv.check_permission(token, permission);
            },
            free_actions || []
        );
        var router = new MongoRouter(this._app, resource_ctl, auth);
        this._resources.push({
            title: title,
            model: resource_model,
            ctl: resource_ctl,
            router: router,
            auth: auth
        });
        router.route();

        return true;
    }

    public async remove_resource(title: string) {
        if(title == "_resources") return false;

        for(let res of this._resources) {
            if(res.title == title) {
                res.model.model.deleteMany({}, function(err: any) {
                    if(err) {
                        console.log(`Error deleting ${res.title}s: ${err}`);
                    }
                });
            }
        }

        return true;
    }

    public async get_permissions() {
        let identity = this._identity;
        let secret = this._identity_secret;

        let identity_token = sign({
            exp: Math.floor(Date.now() / 1000) + (60 * 10),
            permission: ["FINDALL"],
            role: [],
            user: []
        }, secret);

        let permissions = await axios({
            method: 'get',
            url: `${identity}/permissions`,
            headers: {'access-token': identity_token}
        });
        if(permissions.status >= 300 || permissions.status < 200) {
            return null;
        }
        return permissions.data;
    }

    public async create_permission(title: string) {
        let identity = this._identity;
        let secret = this._identity_secret;

        let identity_token = sign({
            exp: Math.floor(Date.now() / 1000) + (60 * 10),
            permission: ["CREATE"],
            role: [],
            user: []
        }, secret);

        let permissions = await this.get_permissions();
        if(!permissions) return null;
        permissions = permissions.map(function(perm: any) {
            return perm.title;
        });

        if(!permissions.includes(title)) {
            let resp = await axios({
                method: 'post',
                url: `${identity}/permissions`,
                headers: {'access-token': identity_token},
                data: {
                    title: title,
                }
            });
            if(resp.status >= 300 || resp.status < 200) {
                return null;
            }
        }
        return true;
    }

    public async get_roles() {
        let identity = this._identity;
        let secret = this._identity_secret;

        let identity_token = sign({
            exp: Math.floor(Date.now() / 1000) + (60 * 10),
            permission: [],
            role: ["FINDALL"],
            user: []
        }, secret);

        let roles = await axios({
            method: 'get',
            url: `${identity}/roles`,
            headers: {'access-token': identity_token}
        });
        if(roles.status >= 300 || roles.status < 200) {
            return null;
        }
        return roles.data;
    }

    public async create_role(title: string, permisions: Array<string>) {
        let identity = this._identity;
        let secret = this._identity_secret;

        let identity_token = sign({
            exp: Math.floor(Date.now() / 1000) + (60 * 10),
            permission: [],
            role: ["CREATE"],
            user: []
        }, secret);

        let roles = await this.get_roles();
        if(!roles) return null;
        roles = roles.map(function(rol: any) {
            return rol.title;
        });

        if(!roles.includes(title)) {
            let resp = await axios({
                method: 'post',
                url: `${identity}/roles`,
                headers: {'access-token': identity_token},
                data: {
                    title: title,
                    permissions: permisions
                }
            });
            if(resp.status >= 300 || resp.status < 200) {
                return null;
            }
        }
        return true;
    }

    public async check_permission(token: string, permission: string) {
        let identity = this._identity;
        if(permission == "" || !token) {
            return false;
        }
        let status = false;
        let response = await axios({
            method: 'post',
            url: `${identity}/check_permission`,
            headers: {'access-token': token},
            data: {permission: permission}
        })
        .then((resp: any) => {
            status = resp.status == 200;
        }).catch((err: any) => {
            status = false
        });
        return status;
    }
}
