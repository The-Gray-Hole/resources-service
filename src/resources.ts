import { MongoModel } from 'rest-mongoose';
import { MongoController, valid_actions } from 'rest-mongoose';
import { MongoRouter } from 'rest-mongoose';
import { urlencoded, json } from 'body-parser';
import { Types, connect, SchemaDefinition } from 'mongoose';
import { Auth } from 'rest-mongoose';
import e from 'express';

var cors = require('cors');

interface ResourcePermissions {
    get: string,
    create: string,
    update: string,
    delete: string
}

interface Resource {
    model: MongoModel,
    ctl: MongoController,
    router: MongoRouter,
    auth: Auth
}

export class ResourceService {
    private _resources: Array<Resource> = [];

    private _app: any;
    private _app_name: string;
    private _port: Number;
    private _identity: string;

    constructor(identity_url: string,
                db_url: string,
                cors_white_list: Array<string>,
                port?: Number,
                app_name?: string) {

        this._identity = identity_url; 
        this._app_name = app_name || "My Resource API";
        this._port = port || 8000;

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

    public add_resource(title: string,
                        shema: SchemaDefinition,
                        timestamps: boolean,
                        resource_permissions: ResourcePermissions,
                        free_actions?: Array<string>) {
        let identity = this._identity;
        let model = new MongoModel(title, shema, timestamps);
        let ctl = new MongoController(model, valid_actions);
        let auth = new Auth(
            async function(token: string, action: string) {
                let axios = require('axios').default;
                var permission = "";
                switch(action) {
                    case 'get':
                        permission = resource_permissions.get;
                        break;
                    case 'create':
                        permission = resource_permissions.create;
                        break;
                    case 'update':
                        permission = resource_permissions.update;
                        break;
                    case 'delete':
                        permission = resource_permissions.delete;
                        break;
                }
                if(permission == "") {
                    return false;
                }
                let response = await axios({
                    method: 'get',
                    url: `${identity}/check_permission`,
                    headers: {'access-token': token},
                    data: {permission: permission}
                });
                return response.status == 200;
            },
            free_actions || []
        );
        let router = new MongoRouter(this._app, ctl, auth);
        this._resources.push({
            model: model,
            ctl: ctl,
            router: router,
            auth: auth
        });
    }

    public route() {

        this._app.get('/', (request: any, response: any) => {
            request;
            response.json({
                "message": `Welcome to test ${this._app_name}.`
            });
        });

        this._resources.forEach(function(resource) {
            resource.router.route();
        });
    }

    public start() {
        this._app.listen(this._port, () => {
            console.log(`Server is listening on port ${String(this._port)}`);
        });
    }
}
