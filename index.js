const path = require('path')
const Funnel = require('broccoli-funnel')
const mergeTrees = require('broccoli-merge-trees')
const AMDDefineFilter = require('./lib/amd-define-filter')
const rewriteLanguageDefinition = require('./lib/rewrite-language-definition')
const rename = require('broccoli-stew').rename
const fs = require('fs')
const hljs = require('highlight.js')
var inclusionFilter = require('./lib/inclusion-filter')
var exclusionFilter = require('./lib/exclusion-filter')

const STRING_CAMELIZE_REGEXP_1 = /(\-|\_|\.|\s)+(.)?/g
const STRING_CAMELIZE_REGEXP_2 = /(^|\/)([A-Z])/g

function camelize(key) {
	return key
		.replace(STRING_CAMELIZE_REGEXP_1, function(match, separator, chr) {
			return chr ? chr.toUpperCase() : ''
		})
		.replace(STRING_CAMELIZE_REGEXP_2, function(match, separator, chr) {
			return match.toLowerCase()
		})
}
function normalizeLanguageName(name) {
	if (/^\d+/.test(name)) {
		name = 'lang-' + name
	}
	return camelize(name)
}

function reorderForCompatibility(languages) {
	let index = languages.findIndex(function(lang) {
		return lang.name === 'cpp'
	})
	let removed = languages.splice(index, 1)
	languages.unshift(removed[0])
	return languages
}

module.exports = {
	name: 'ember-code-block',

	included(app) {
		this._super.included && this._super.included.apply(this, arguments)
		let target = findTargetHost(this, app)
		this.app = app

		let config = app.project.config(app.env) || {}
		// let addonConfig = config[this.name] || {};
		let addonConfig = {
			style: 'tomorrow-night-eighties',
			languages: {
				// only: ['cos']
			},
		}

		this.languages = this.getLanguages(addonConfig)
		this.style = addonConfig.style || 'default'

		target.import(path.posix.join('vendor', 'highlight', 'highlight.js'), {
			using: [{ transformation: 'amd', as: 'highlight' }],
		})

		// this.import(path.join('vendor', 'highlight', 'highlight.js'))

		// let importAssert = this.import.bind(this)
		// this.languages.forEach(function(language) {
		// 	importAssert(path.join('vendor', 'highlight', `${language.file}`))
		// })

		// app.import('highlight/styles.css')
	},

	getLanguages(config) {
		let allLanguages = this._allLanguages()
		let languages = config.languages || { only: [], except: [] }
		let onlyLanguages = languages.only || []
		let exceptLanguages = languages.except || []
		return allLanguages
			.filter(inclusionFilter(onlyLanguages))
			.filter(exclusionFilter(exceptLanguages))
	},

	treeForVendor() {
		let trees = []

		// Load highlight.js into vendor tree as `highlight`
		trees.push(this._highlightTree())

		// Load languages into vendor tree as `highlight/<language>`
		let languageTreeFactory = this._languageTree
		this.languages.forEach(function(language) {
			trees.push(languageTreeFactory(language))
		})

		return mergeTrees(trees)
	},

	_allLanguages() {
		let languages = []
		let languagesPath = path.join(require.resolve('highlight.js'), '../languages')
		fs.readdirSync(languagesPath).map(function(file) {
			let lang = require(path.join(languagesPath, file))(hljs)

			let definition = {
				aliases: lang.aliases || [],
				variable: normalizeLanguageName(file.split('.')[0]),
				name: file.split('.')[0],
				file: file,
			}

			languages.push(definition)
		})

		languages = reorderForCompatibility(languages)

		return languages
	},

	treeForStyles() {
		let srcPath = path.join(require.resolve('highlight.js'), '..', '..', 'styles')

		try {
			fs.statSync(path.join(srcPath, this.style)).isFile()
		} catch (err) {
			this.ui.writeWarnLine('[ember-code-block] style does not exist', this.style)
			// return null;
		}

		let tree = new Funnel(srcPath, {
			files: [this.style + '.css'],
			annotation: 'Funnel: highlight.js style',
		})

		return rename(tree, function() {
			return '/highlight/styles.css'
		})
	},

	_languageTree(language) {
		let srcPath = path.join(require.resolve('highlight.js'), '..', 'languages')

		let tree = new Funnel(srcPath, {
			include: [language.file],
			destDir: language.file,
			annotation: `Funnel: highlight.js language: ${language.name}`,
		})

		let srcTree = new AMDDefineFilter(tree, `highlight/languages/${language.name}`, {
			rewriterFunction: rewriteLanguageDefinition,
		})

		return rename(srcTree, function() {
			return `/highlight/${language.file}`
		})
	},

	_highlightTree() {
		// Package up the highlight.js source from its node module.
		let srcPath = path.join(require.resolve('highlight.js'), '..')

		let tree = new Funnel(srcPath, {
			files: ['highlight.js'],
			destDir: `highlight`,
			annotation: `Funnel: highlight.js`,
		})

		return tree

		// console.log(this.languages);
		// let srcTree = new AMDDefineFilter(tree, 'highlight', {
		// 	languages: this.languages,
		// })
		// return rename(srcTree, function() {
		// 	return `/highlight/highlight.js`
		// })
	},
}

function findTargetHost(addon, app) {
	let target = app

	if (typeof addon.import === 'function') {
		target = addon
	} else {
		// If the addon has the _findHost() method (in ember-cli >= 2.7.0), we'll just
		// use that.
		if (typeof addon._findHost === 'function') {
			target = addon._findHost()
		}

		// Otherwise, we'll use this implementation borrowed from the _findHost()
		// method in ember-cli.
		// Keep iterating upward until we don't have a grandparent.
		// Has to do this grandparent check because at some point we hit the project.
		let current = addon
		do {
			target = current.app || app
		} while (current.parent.parent && (current = current.parent))
	}

	return target
}
