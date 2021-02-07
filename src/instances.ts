import { MongoModel } from 'rest-mongoose';
import { MongoController, valid_actions } from 'rest-mongoose';
import { MongoRouter } from 'rest-mongoose';
import { Types, SchemaDefinition } from 'mongoose';
import { Auth } from 'rest-mongoose';
import {
    get_permissions,
    create_permission,
    get_roles,
    create_role,
    check_permission
} from './identity_handler';
import { Resource } from './resources';

interface App {
    post: Function,
    get: Function,
    put: Function,
    delete: Function,
    _router: {
        stack: any
    }
}

export async function add_resource
(
    identity_url: string,
    identity_token: string,
    app: App,
    title: string,
    shema: string,
    timestamps: boolean,
    free_actions?: Array<string>
)
{
    var _shema = JSON.parse(shema);
    _shema.__owner_uid = {
        type: String,
        unique: false,
        required: false
    },
    _shema = _shema as SchemaDefinition;
    var resource_model = new MongoModel(title, _shema, timestamps);
    var resource_ctl = new MongoController(resource_model, valid_actions);

    var new_permissions = [
        `to_get_${title}`,
        `to_create_${title}`,
        `to_update_${title}`,
        `to_delete_${title}`,
    ]

    for(let i = 0; i < new_permissions.length; i++) {
        let resp = await create_permission(identity_url, identity_token, new_permissions[i]);
        if(!resp) return null;
    }

    var roles = await get_roles(identity_url, identity_token);
    if(!roles) return null;

    let permissions = await get_permissions(identity_url, identity_token);
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
        let resp = create_role(
            identity_url,
            identity_token,
            new_roles[i].title,
            new_roles[i].permissions
        );
        if(!resp) return null;
    }

    var resource_auth = new Auth(
        resource_model,
        async function(token: string, action: string, instance_id: string) {
            var permission = "";
            var must_be_owner = false;
            var owner_id = null;

            switch(action) {
                case 'FINDALL': case 'FINDONE':
                    permission = get_perm_id;
                    break;
                case 'CREATE':
                    permission = create_perm_id;
                    break;
                case 'UPDATE':
                    permission = update_perm_id;
                    must_be_owner = true;
                    break;
                case 'DELETE':
                    permission = delete_perm_id;
                    must_be_owner = true;
                    break;
            }

            if(instance_id) {
                let resource_instance = await resource_model.model.findById(instance_id);
                owner_id = resource_instance.__owner_uid;
            }
            var resp = await check_permission(identity_url, token, permission);
            if(resp.status == 200) {
                if(must_be_owner) {
                    if(owner_id) {
                        return owner_id == resp.data.data.uid;
                    } else {
                        return false;
                    }
                } else {
                    return true;
                }
            }
            return false;
        },
        free_actions || []
    );
    var resource_router = new MongoRouter(app, resource_ctl, resource_auth);

    resource_router.route();

    return {
        model: resource_model,
        controller: resource_ctl,
        auth: resource_auth,
        router: resource_router
    };
}

export async function remove_resource
(
    title: string,
    resources: Array<Resource>,
    app: App
)
{
    if(title == "_resource") return false;

    for(let res of resources) {
        if(res.model.name == title) {
            res.model.model.deleteMany({}, function(err: any) {
                if(err) {
                    console.log(`Error deleting ${res.model.name}s: ${err}`);
                }
            });
        }
        var routes = app._router.stack;
        console.log(routes);
    }

    return true;
}
