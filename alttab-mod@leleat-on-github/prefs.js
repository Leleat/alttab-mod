"use strict";

const {Gio, GObject, Gtk} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const shellVersion = parseFloat(imports.misc.config.PACKAGE_VERSION);

function init() {
}

function buildPrefsWidget() {
	const prefsWidget = new PrefsWidget();
	shellVersion < 40 && prefsWidget.show_all();
	return prefsWidget;
}

const PrefsWidget = GObject.registerClass(
	class AltTabModPrefsWidget extends Gtk.Box {
		_init(params) {
			super._init(params);

			this.builder = new Gtk.Builder();
			this.builder.add_from_file(Me.path + "/prefs.ui");

			const mainPrefs = this.builder.get_object("main_prefs");
			shellVersion < 40 ? this.add(mainPrefs) : this.append(mainPrefs);

			const gschema = Gio.SettingsSchemaSource.new_from_directory(Me.dir.get_child("schemas").get_path(), Gio.SettingsSchemaSource.get_default(), false);
			const settingsSchema = gschema.lookup("org.gnome.shell.extensions.altTab-mod", true);
			this.settings = new Gio.Settings({settings_schema: settingsSchema});

			this.bindWidgetsToSettings(settingsSchema.list_keys());
		}

		bindWidgetsToSettings(keys) {
			keys.forEach(key => {
				const widget = this.builder.get_object(key);
				widget && this.settings.bind(key, widget, "active", Gio.SettingsBindFlags.DEFAULT);
			});
		}
	}
)
