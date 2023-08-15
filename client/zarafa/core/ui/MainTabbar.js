Ext.namespace('Zarafa.core.ui');

/**
 * @class Zarafa.core.ui.MainTabBar
 * @extends Ext.Toolbar
 * @xtype zarafa.maintabbar
 *
 * The MainTabBar shows the tabs at the top of the application. It can be filled by two insertion
 * points that populate the left and the right side of the bar. It will use instances of the
 * {@link Zarafa.core.ui.MainTab MainTab} to represent the tabs.
 */
Zarafa.core.ui.MainTabBar = Ext.extend(Ext.Toolbar, {
	// Insertion points for this class
	/**
	 * @insert main.maintabbar.left
	 * Insertion point for populating main tabbar to the left. The tabOrderIndex is used to
	 * determine the order of the tabs. The lower the number the more to the left the button is
	 * added.
	 * @param {Zarafa.core.ui.MainTabBar} toolbar This toolbar
	 */
	/**
	 * @insert main.maintabbar.right
	 * Insertion point for populating main tabbar to the right. The tabOrderIndex is used to
	 * determine the order of the tabs. The lower the number the more to the right the button is
	 * added.
	 * @param {Zarafa.core.ui.MainTabBar} toolbar This toolbar
	 */

	/**
	 * @constructor
	 * @param config Configuration structure
	 */	
	filesContextAdded : [false, false],

	constructor: function(config)
	{
		config = config || {};

		Ext.applyIf(config, {
			// Override from Ext.Component
			xtype: 'zarafa.maintabbar',
			id: 'zarafa-mainmenu',
			cls: 'zarafa-maintoolbar zarafa-maintabbar',
			// cls: 'zarafa-maintabbar grommunio-image',
			defaultType: 'zarafa.maintab'
		});
		Zarafa.core.ui.MainTabBar.superclass.constructor.call(this, config);
		this.addFilesContext();
		this.initBar();
	},

	/**
	 * Add items to this toolbar by using the main.maintabbar.left and main.maintabbar.right
	 * insertion points. Also the text who is logged in and the log out button is added. The buttons
	 * added through the insertion points are sorted using the tabOrderIndex set on the objects in
	 * the list returned by the insertion point.
	 * @private
	 */
	initBar: function()
	{

		var leftItems = container.populateInsertionPoint('main.maintabbar.left', this) || [];
		var rightItems = container.populateInsertionPoint('main.maintabbar.right', this) || [];
		console.log(rightItems);

		var zeroItem = leftItems[0]; var secondItem = leftItems[2];var fifthItem = leftItems[5];
		var firstItem = leftItems[1]; var fourthItem = leftItems[4];
		var leftItems1 = [zeroItem, secondItem, fifthItem, firstItem, fourthItem];

		// Make sure the items are properly sorted by priority.
		leftItems1 = Zarafa.core.Util.sortArray(leftItems1, 'ASC', 'tabOrderIndex');
		// The right items are sorted so that the first item appears to the most right
		rightItems = Zarafa.core.Util.sortArray(rightItems, 'DESC', 'tabOrderIndex');

		this.addTooltip(leftItems1, rightItems);

		var loginText = {
				xtype: 'tbtext',
				width: 'auto',
				cls: 'zarafa-maintabbar-logintext',
				text: container.getUser().getDisplayName(),
				id: 'mainmenu-logintext'
		};

		// Adding reminder button with bell icon.
		var reminder = {
			width: 30,
			id: 'mainmenu-button-reminder',
			ref: 'reminder',
			handler: function() {
				var store = container.getReminderStore();
				Zarafa.common.Actions.openReminderContent(store.getRange());
			},
			listeners: {
				afterRender: function(reminderBtn) {
					var store = container.getReminderStore();
					var recordLength = store.getRange().length;
					reminderBtn.getEl().setStyle('backgroundImage', 'url(\'' + Zarafa.common.ui.IconClass.getReminderSvgIcon( recordLength ) + '\')');
					var noReminder = recordLength === 0;
					reminderBtn.setDisabled(noReminder);
					reminderBtn.setTooltip(noReminder? _('There are no reminders'): '');
				},
				scope: this
			},
			style: {
				backgroundImage: 'url(\'' + Zarafa.common.ui.IconClass.getReminderSvgIcon() + '\')',
				backgroundRepeat: 'no-repeat',
				backgroundPosition: 'center'
			},
			scope: this
		};

		this.add(leftItems1, {xtype: 'tbfill'}, loginText, reminder, rightItems);

		// Don't show the logout button when using SSO, but always show it in DeskApp
		if ( !container.getServerConfig().usingSSO() || Zarafa.isDeskApp ){
			var logoutButton = {
				text: _('Logout'),
				handler: this.onLogoutButton,
				id: 'mainmenu-button-logout'
			};

			this.add(logoutButton);
		}
	},

	/**
	 * Used to apply key shortcut and context name in tooltip.
	 * @param {Array} leftItems1 The leftItems1 contains the left context items which are properly sorted by priority.
	 * @param {Array} rightItems The rightItems contains the right context items.
	 */
	addTooltip: function(leftItems1, rightItems)
	{
		var contextItems = [];
		contextItems = contextItems.concat(leftItems1, rightItems);
		Ext.each(contextItems, function(context, index) {
			context.tooltip = context.text + ' (Ctrl + '+index+')';
		});
	},

	// addFilesContext: function() 
	// {
	// 	return new Zarafa.plugins.files.FilesContext();
	// },		console.log(addFilesContext());
	/**
	 * Event handler which is called when the user presses the 'logout' button
	 * @private
	 */
	onLogoutButton: function()
	{
		container.logout();
	},


	addFilesContext: function() 
	{
		if (!this.filesContextAdded.includes(true)) {
			new Zarafa.plugins.files.FilesContext();
			// Zarafa.onReady(function () {
			// 	if (container.getSettingsModel().get('zarafa/v1/plugins/files/enable') === true) {
			// 		container.registerContext(new Zarafa.core.ContextMetaData({
			// 			name             : 'filescontext',
			// 			displayName      : _('Files'),
			// 			allowUserVisible : false,
			// 			allowUserDisable: false,
			// 			pluginConstructor: Zarafa.plugins.files.FilesContext
			// 		}));
			// 	}
			// });
			this.filesContextAdded.push(true)
		}
	}
});
Ext.reg('zarafa.maintabbar', Zarafa.core.ui.MainTabBar);
