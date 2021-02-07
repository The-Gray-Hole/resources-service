import { MongoModel } from 'rest-mongoose';
import { MongoController, valid_actions } from 'rest-mongoose';
import { MongoRouter } from 'rest-mongoose';
import { urlencoded, json } from 'body-parser';
import { Types, connect, SchemaDefinition } from 'mongoose';
import { Auth } from 'rest-mongoose';
import {
    get_permissions,
    create_permission,
    get_roles,
    create_role,
    get_users,
    create_user,
    check_permission
} from './identity_handler';
import { add_resource, remove_resource } from './instances';

var axios = require('axios').default;
var cors = require('cors');

var RESOURCES_PERM = "_to_manage_resources";
var RESOURCES_ADMIN_ROLE = "_resources_admin";

export interface Resource {
    model: MongoModel,
    controller: MongoController,
    auth: Auth,
    router: MongoRouter
}

export class ResourcesService {
    private _resources: Array<Resource> = [];

    private _app: any;
    private _app_name: string;
    private _port: Number;
    private _identity_url: string;
    private _identity_token: string;
    private _resources_model: MongoModel;
    private _resources_ctl: MongoController;
    private _resources_auth: Auth | null = null;
    private _resources_router: MongoRouter | null = null;
    private _admin_username: string;
    private _admin_email: string;
    private _admin_password: string;

    constructor(identity_url: string,
                identity_token: string,
                db_url: string,
                cors_white_list: Array<string>,
                admin_username: string,
                admin_email: string,
                admin_password: string,
                port?: Number,
                app_name?: string) {

        this._identity_url = identity_url; 
        this._identity_token = identity_token; 
        this._app_name = app_name || "My Resource API";
        this._port = port || 8000;

        this._admin_username = admin_username;
        this._admin_email = admin_email;
        this._admin_password = admin_password;

        this._resources_model = new MongoModel(
            "_resource",
            {
                title: {
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
        let created = await create_permission(
            this._identity_url,
            this._identity_token,
            RESOURCES_PERM
        );
        if(!created) return null;

        let permissions = await get_permissions(this._identity_url, this._identity_token);
        if(!permissions) return null;

        let resources_admin_perm = permissions.filter(function(perm: any) {
            return perm.title == RESOURCES_PERM;
        })[0]._id;

        created = await create_role(
            this._identity_url,
            this._identity_token,
            RESOURCES_ADMIN_ROLE,
            [resources_admin_perm]
        );
        if(!created) return null;

        let roles = await get_roles(this._identity_url, this._identity_token);
        let resources_admin_role = roles.filter(function(role: any) {
            return role.title == RESOURCES_ADMIN_ROLE;
        })[0]._id;

        create_user(
            this._identity_url,
            this._identity_token,
            this._admin_username,
            this._admin_email,
            this._admin_password,
            [resources_admin_role]
        )

        this._resources_auth = new Auth(
            this._resources_model,
            async (token: string, action: string, instance_id: string) => {
                return await check_permission(
                    this._identity_url,
                    token,
                    resources_admin_perm
                );
            },
            []
        );

        this._resources_router = new MongoRouter(
            this._app,
            this._resources_ctl,
            this._resources_auth
        );

        this._resources_model.model.find().then( (resources: any) => {
            for(let res of resources) {
                add_resource(
                    this._identity_url,
                    this._identity_token,
                    this._app,
                    res.title,
                    res.str_shema,
                    res.timestamps,
                    res.free_actions
                ).then((resource: Resource | null) => {
                    if(resource) {
                        this._resources.push(resource);
                    } else {
                        console.log(`Error adding resource: ${resource}`);
                    }
                }).catch((err: any) => {
                    console.log(`Error adding resource: ${err}`);
                });
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
            this._resources_router.route( (action: string, data: any) => {
                switch (action) {
                    case "CREATE":
                        add_resource(
                            this._identity_url,
                            this._identity_token,
                            data.title,
                            data.str_shema,
                            data.timestamps,
                            data.free_actions
                        );
                        break;
                    case "DELETE":
                        remove_resource(data.title, this._resources, this._app);
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

}
