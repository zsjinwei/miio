"use strict";

const { Thing, Children } = require("abstract-things");
const { ChildSyncer } = require("abstract-things/children");

const MiioApi = require("../device");

const DeveloperApi = require("./gateway/developer-api");
const CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

const SubDevice = require("./gateway/subdevice");
const types = require("./gateway/subdevices");

/**
 * Generate a key for use with the local developer API. This does not generate
 * a secure key, but the Mi Home app does not seem to do that either.
 */
function generateKey() {
	let result = "";
	for (let i = 0; i < 16; i++) {
		let idx = Math.floor(Math.random() * CHARS.length);
		result += CHARS[idx];
	}
	return result;
}

/**
 * Abstraction over a Mi Smart Home Acpartner.
 *
 * This device is very different from most other miIO-devices in that it has
 * devices on its own. There seems to be a way to talk to these devices by
 * setting `sid` in the requests, which means we can poll them. The problem
 * is that certain devices also send events, but these seem to only be
 * accessible over a local developer connection.
 *
 * So to work around this we activate the local developer connection and use
 * that together with the regular calls for changing things on the gateway.
 */
const Acpartner = Thing.type(
	(Parent) =>
		class Acpartner extends Parent.with(MiioApi, Children) {
			static get type() {
				return "miio:acpartner";
			}

			static get SubDevice() {
				return SubDevice;
			}

			static registerSubDevice(id, deviceClass) {
				types[id] = deviceClass;
			}

			static availableAPI(builder) {
				builder.action("addDevice").done();

				builder.action("stopAddDevice").done();

				builder.action("removeDevice").done();
			}

			constructor(options) {
				super(options);

				this.defineProperty("ip", {
					name: "ip",
				});

				this.extraChildren = [];

				// Monitor every minute right now
				this._monitorInterval = 60 * 1000;

				this.syncer = new ChildSyncer(this, (def, current) => {
					// Shortcut to detect extra child
					if (def.metadata && def.id) return def;

					if (!def.online) {
						console.log(
							"debug child is not on listening problem",
							def,
							" is offline"
						);
						return;
					}

					if (current) return current;

					const type = types[def.type] || SubDevice;
					const device = new type(this, {
						id: def.id,
						model: "lumi.generic." + def.type,
					});

					return device;
				});
			}

			_report(properties) {
				for (let i in properties) {
					for (let key in properties[i]) {
						this.setProperty(key, properties[i][key]);
					}
				}
				// 	Object.keys(properties).forEach(key => {
				// 	this.setProperty(key, properties[key]);
				// });
			}

			initCallback() {
				return super
					.initCallback()
					.then(() => this._findDeveloperKey())
					.then(() => this._updateDeviceList())
					.then(() => {
						// Update devices once every half an hour
						this._deviceListTimer = setInterval(
							this._updateDeviceList.bind(this),
							30 * 60 * 1000
						);
					});
			}

			destroyCallback() {
				return super.destroyCallback().then(() => {
					if (this.devApi) {
						this.devApi.destroy();
					}

					clearInterval(this._deviceListTimer);
				});
			}

			addExtraChild(child) {
				this.extraChildren.push(child);
			}

			_updateDeviceList() {
				function stripLumiFromId(id) {
					if (id.indexOf("lumi.") === 0) {
						return id.substring(5);
					}
					return id;
				}

				return this.call("get_device_prop", ["lumi.0", "device_list"]).then(
					(list) => {
						const defs = [...this.extraChildren];
						for (let i = 0; i < list.length; i += 5) {
							const id = stripLumiFromId(list[i]);
							const type = list[i + 1];
							const online = list[i + 2] === 1;

							// Sanity check, skip gateway if found
							if (id === "0") continue;

							defs.push({
								id: "miio:" + id,
								type: type,
								online: online,
							});
						}

						return this.syncer.update(defs);
					}
				);
			}

			/**
			 * Either resolve the developer key or setup a new one.
			 */
			_findDeveloperKey() {
				// We already have a developer key
				if (this._developerKey) return Promise.resolve(this._developerKey);

				// Call and fetch the key or set a new key
				return this.call("get_lumi_dpf_aes_key")
					.then((result) => {
						let key = result[0];
						if (key && key.length === 16) {
							// This is a valid key, store it
							return key;
						}

						key = generateKey();
						return this.call("set_lumi_dpf_aes_key", [key]);
					})
					.then((key) => this._setDeveloperKey(key));
			}

			/**
			 * Set the developer key and start listenting for events from the gateway.
			 */
			_setDeveloperKey(key) {
				this._developerKey = key;

				// If we are already connected to the Developer API skip init
				if (this.devApi) return Promise.resolve();

				return new Promise((resolve, reject) => {
					this.devApi = new DeveloperApi(this, this.management.address);

					this.devApi.on("propertiesChanged", (e) => {
						if (e.id === "0") {
							// Data for the local gateway
							this._report(e.data);
						}
					});
					this.devApi.on("ready", resolve);

					setTimeout(reject, 10000);
				});
			}

			/**
			 * Start the process of adding a device. Allows Zigbee devices to join for
			 * 30 seconds.
			 */
			addDevice() {
				return this.call("start_zigbee_join", [30])
					.then(MiioApi.checkOk)
					.then(() => setTimeout(this._updateDeviceList.bind(this), 30000))
					.then(() => undefined);
			}

			/**
			 * Stop allowing devices to join.
			 */
			stopAddDevice() {
				return this.call("start_zigbee_join", [0])
					.then(MiioApi.checkOk)
					.then(() => undefined);
			}

			/**
			 * Remove a device from the gateway using the identifier of the device.
			 */
			removeDevice(id) {
				return this.call("remove_device", [id])
					.then(MiioApi.checkOk)
					.then(this._updateDeviceList.bind(this))
					.then(() => undefined);
			}
		}
);

module.exports = Acpartner;
