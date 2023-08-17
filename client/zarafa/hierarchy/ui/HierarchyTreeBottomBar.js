Ext.namespace('Zarafa.hierarchy.ui');

/**
 * @class Zarafa.hierarchy.ui.HierarchyTreeBottomBar
 * @extends Ext.Container
 * @xtype zarafa.hierarchybottombar
 */
Zarafa.hierarchy.ui.HierarchyTreeBottomBar = Ext.extend(Ext.Container, {
	/**
	 * @cfg {Zarafa.hierarchy.data.SharedFolderTypes} defaultSelectedSharedFolderType The default
	 * type of Shared Folder that is selected in the dialog that will be opened.
	 */
	defaultSelectedSharedFolderType: null,

	/**
	 * @cfg {String} buttonText The text that should be displayed on the button to open shared folders.
	 */
	buttonText: _('New Mail'),

	/**
	 * @constructor
	 * @param config Configuration structure
	 */
	constructor: function(config)
	{
		config = config || {};

		var buttonText = Ext.util.Format.htmlEncode(config.buttonText || this.buttonText);

		Ext.applyIf(config, {
			cls: 'zarafa-hierarchy-treepanel-bottombar',
			layout:'table',
			defaultSelectedSharedFolderType: Zarafa.hierarchy.data.SharedFolderTypes['ALL'],

			items: [	{
							xtype: 'menuitem',
									id: 'zarafa-maintoolbar-newitem-mail',
									tooltip: _('Email')+ ' (Ctrl + Alt + X)',
									plugins: 'zarafa.menuitemtooltipplugin',
									text: _('New Mail'),
									iconCls: 'icon_write',
									newMenuIndex: 1,
									context: 'mail',
									handler: function()
									{
										Zarafa.mail.Actions.openCreateMailContent(this.getModel());
									},
									scope: this
						}
						// , {
						// 	xtype: 'menuitem',
						// 			id: 'zarafa-maintoolbar-newitem-mailo',
						// 			tooltip: _('Email')+ ' (Ctrl + Alt + X)',
						// 			plugins: 'zarafa.menuitemtooltipplugin',
						// 			text: _('Home'),
						// 			iconCls: 'icon_new_email',
						// 			newMenuIndex: 2,
						// 			context: 'mail',
						// 			handler: function()
						// 			{
						// 				new Zarafa.mail.ui.MailPanel();
						// 			},
						// 			scope: this
						// 		}
					]
		});

		Zarafa.hierarchy.ui.HierarchyTreeBottomBar.superclass.constructor.call(this, config);
	},
	
	getModel: function()
	{
		if (!Ext.isDefined(this.model)) {
			this.model = new Zarafa.mail.MailContextModel();
			this.model.on({
				'searchstart': this.onModelSearchStart,
				'searchstop': this.onModelSearchStop,
				'livescrollstart': this.onModelLiveScrollStart,
				'livescrollstop': this.onModelLiveScrollStop,
				scope: this
			});
		}
		return this.model;
	},
	/**
	 * Called when the button to open Shared Folders is pressed. It will open the dialog to let the
	 * user decide on what folder to open. This function is called within the scope of the
	 * {@link Zarafa.hierarchy.ui.HierarchyTreeBottomBar}.
	 * @param {Ext.Button} button, The Button
	 * @param {Ext.EventObject} event The click event
	 */
	openSharedFolder: function(button, event){
		Zarafa.hierarchy.Actions.openSharedFolderContent(this.defaultSelectedSharedFolderType);
	}
});

Ext.reg('zarafa.hierarchytreebottombar', Zarafa.hierarchy.ui.HierarchyTreeBottomBar);
