sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/VBox",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Text"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, VBox, Label, Input, Text) {
  "use strict";

  const BASE_URL = "/sap/opu/odata/sap/API_PRODUCT_SRV";

  return Controller.extend("com.articles.search.controller.App", {

    onInit: function () {
      this.getView().setModel(new JSONModel({
        productFrom: "",
        productTo: "",
        language: "FR",
        results: [],
        totalCount: -1,
        noDataText: this._i18n("noDataText")
      }), "viewModel");

      this.getView().setModel(new JSONModel({
        product: "",
        description: "",
        plants: [],
        visible: false,
        loading: false
      }), "plantModel");

      this._oEditDialog = null;
    },

    // --------------------------------------------------------
    // Recherche principale
    // --------------------------------------------------------
    onSearch: function () {
      var oModel = this.getView().getModel("viewModel");
      var sFrom  = (oModel.getProperty("/productFrom") || "").trim().toUpperCase();
      var sTo    = (oModel.getProperty("/productTo")   || "").trim().toUpperCase();
      var sLang  = oModel.getProperty("/language") || "FR";

      if (!sLang) {
        MessageBox.warning(this._i18n("msgLangRequired"));
        return;
      }

      var aFilters = ["Language eq '" + sLang + "'"];
      if (sFrom) { aFilters.push("Product ge '" + sFrom + "'"); }
      if (sTo)   { aFilters.push("Product le '" + sTo   + "'"); }

      var sUrl = BASE_URL + "/A_ProductDescription" +
        "?$format=json&$orderby=Product asc&$top=500" +
        "&$filter=" + encodeURIComponent(aFilters.join(" and "));

      var oTable = this.byId("resultsTable");
      oTable.setBusy(true);
      this.getView().getModel("plantModel").setProperty("/visible", false);

      fetch(sUrl, { headers: { Accept: "application/json" } })
        .then(function (r) {
          if (!r.ok) { throw new Error("HTTP " + r.status); }
          return r.json();
        })
        .then(function (oData) {
          var aResults = (oData.d && oData.d.results) ? oData.d.results : [];
          oModel.setProperty("/results", aResults);
          oModel.setProperty("/totalCount", aResults.length);
          oTable.setBusy(false);
        }.bind(this))
        .catch(function (e) {
          oTable.setBusy(false);
          oModel.setProperty("/totalCount", 0);
          MessageBox.error(this._i18n("msgSearchError") + "\n" + e.message);
        }.bind(this));
    },

    // --------------------------------------------------------
    // Sélection d'un article → charger les divisions
    // --------------------------------------------------------
    onSelectArticle: function (oEvent) {
      var oItem    = oEvent.getParameter("listItem") || oEvent.getSource();
      var oCtx     = oItem.getBindingContext("viewModel");
      var sProduct = oCtx.getProperty("Product");
      var sDesc    = oCtx.getProperty("ProductDescription");

      oItem.setSelected(false);

      var oPlantModel = this.getView().getModel("plantModel");
      oPlantModel.setProperty("/product", sProduct);
      oPlantModel.setProperty("/description", sDesc);
      oPlantModel.setProperty("/plants", []);
      oPlantModel.setProperty("/visible", true);
      oPlantModel.setProperty("/loading", true);

      this._loadPlants(sProduct);
    },

    _loadPlants: function (sProduct) {
      var oPlantModel = this.getView().getModel("plantModel");
      var sUrl = BASE_URL + "/A_ProductSupplyPlanning" +
        "?$format=json&$orderby=Plant asc" +
        "&$filter=" + encodeURIComponent("Product eq '" + sProduct + "'") +
        "&$select=Product,Plant,MRPType,LotSizingProcedure";

      fetch(sUrl, { headers: { Accept: "application/json" } })
        .then(function (r) {
          if (!r.ok) { throw new Error("HTTP " + r.status); }
          return r.json();
        })
        .then(function (oData) {
          var aPlants = (oData.d && oData.d.results) ? oData.d.results : [];
          oPlantModel.setProperty("/plants", aPlants);
          oPlantModel.setProperty("/loading", false);
        })
        .catch(function (e) {
          oPlantModel.setProperty("/loading", false);
          MessageBox.error(this._i18n("msgSearchError") + "\n" + e.message);
        }.bind(this));
    },

    // --------------------------------------------------------
    // Ouvrir la dialog de modification
    // --------------------------------------------------------
    onEditPlant: function (oEvent) {
      var oItem    = oEvent.getSource().getParent();
      var oCtx     = oItem.getBindingContext("plantModel");
      var oPlant   = oCtx.getObject();

      // Modèle temporaire pour la dialog
      var oEditModel = new JSONModel({
        Product:            oPlant.Product,
        Plant:              oPlant.Plant,
        MRPType:            oPlant.MRPType,
        LotSizingProcedure: oPlant.LotSizingProcedure,
        saving:             false
      });

      if (!this._oEditDialog) {
        this._oEditDialog = this._createEditDialog();
        this.getView().addDependent(this._oEditDialog);
      }

      this._oEditDialog.setModel(oEditModel, "editModel");
      this._oEditDialog.open();
    },

    _createEditDialog: function () {
      var that = this;

      return new Dialog({
        title: "{editModel>/Product} / {editModel>/Plant}",
        contentWidth: "25rem",
        content: [
          new VBox({ class: "sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom" }).addItem(
            new Label({ text: that._i18n("colMRPType"), labelFor: "mrpTypeInput" })
          ).addItem(
            new Input("mrpTypeInput", {
              value: "{editModel>/MRPType}",
              maxLength: 2,
              placeholder: "ex: PD, VB, ND..."
            })
          ).addItem(
            new Label({ text: that._i18n("colLotSize"), labelFor: "lotSizeInput" })
          ).addItem(
            new Input("lotSizeInput", {
              value: "{editModel>/LotSizingProcedure}",
              maxLength: 2,
              placeholder: "ex: EX, FX, HB..."
            })
          )
        ],
        beginButton: new Button({
          type: "Emphasized",
          text: that._i18n("save"),
          enabled: "{= !${editModel>/saving} }",
          press: function () { that._onSavePlant(); }
        }),
        endButton: new Button({
          text: that._i18n("cancel"),
          press: function () { that._oEditDialog.close(); }
        })
      });
    },

    // --------------------------------------------------------
    // Sauvegarde PATCH avec token CSRF
    // --------------------------------------------------------
    _onSavePlant: function () {
      var oEditModel  = this._oEditDialog.getModel("editModel");
      var sProduct    = oEditModel.getProperty("/Product");
      var sPlant      = oEditModel.getProperty("/Plant");
      var sMRPType    = (oEditModel.getProperty("/MRPType") || "").trim().toUpperCase();
      var sLotSize    = (oEditModel.getProperty("/LotSizingProcedure") || "").trim().toUpperCase();

      oEditModel.setProperty("/saving", true);

      var sEntityUrl = BASE_URL +
        "/A_ProductSupplyPlanning(Product='" + encodeURIComponent(sProduct) +
        "',Plant='" + encodeURIComponent(sPlant) + "')";

      // Étape 1 : fetch du token CSRF
      fetch(BASE_URL + "/", {
        method: "GET",
        headers: { "x-csrf-token": "fetch", Accept: "application/json" }
      })
        .then(function (r) {
          var sToken = r.headers.get("x-csrf-token");
          if (!sToken) { throw new Error("CSRF token non reçu"); }
          return sToken;
        })
        .then(function (sToken) {
          // Étape 2 : PATCH
          return fetch(sEntityUrl, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Accept":       "application/json",
              "x-csrf-token": sToken
            },
            body: JSON.stringify({
              MRPType:            sMRPType,
              LotSizingProcedure: sLotSize
            })
          });
        })
        .then(function (r) {
          if (!r.ok) { throw new Error("HTTP " + r.status); }
          oEditModel.setProperty("/saving", false);
          this._oEditDialog.close();
          MessageToast.show(this._i18n("msgSaveSuccess"));
          // Recharger les divisions
          this._loadPlants(sProduct);
        }.bind(this))
        .catch(function (e) {
          oEditModel.setProperty("/saving", false);
          MessageBox.error(this._i18n("msgSaveError") + "\n" + e.message);
        }.bind(this));
    },

    // --------------------------------------------------------
    // Réinitialiser
    // --------------------------------------------------------
    onReset: function () {
      var oModel = this.getView().getModel("viewModel");
      oModel.setProperty("/productFrom", "");
      oModel.setProperty("/productTo", "");
      oModel.setProperty("/language", "FR");
      oModel.setProperty("/results", []);
      oModel.setProperty("/totalCount", -1);
      this.getView().getModel("plantModel").setProperty("/visible", false);
    },

    // --------------------------------------------------------
    // Export CSV
    // --------------------------------------------------------
    onExport: function () {
      var oVM      = this.getView().getModel("viewModel");
      var aResults = oVM.getProperty("/results");

      if (!aResults || aResults.length === 0) {
        MessageToast.show(this._i18n("msgNoDataExport"));
        return;
      }

      var sHeader  = "Code Article;Désignation;Langue\n";
      var sRows    = aResults.map(function (o) {
        return o.Product + ";" + (o.ProductDescription || "").replace(/;/g, ",") + ";" + o.Language;
      }).join("\n");

      var sContent = "\uFEFF" + sHeader + sRows;
      var oBlob    = new Blob([sContent], { type: "text/csv;charset=utf-8;" });
      var sLink    = URL.createObjectURL(oBlob);
      var oLink    = document.createElement("a");
      oLink.href   = sLink;
      oLink.download = "articles_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(oLink);
      oLink.click();
      document.body.removeChild(oLink);
      URL.revokeObjectURL(sLink);
      MessageToast.show(this._i18n("msgExportDone"));
    },

    // --------------------------------------------------------
    // Formateurs
    // --------------------------------------------------------
    formatResultCount: function (iCount) {
      if (iCount === null || iCount === undefined || iCount < 0) { return ""; }
      if (iCount === 0) { return this._i18n("noDataFound"); }
      return iCount + " " + (iCount > 1 ? this._i18n("results") : this._i18n("result"));
    },

    formatPlantPanelTitle: function (sProduct, sDesc) {
      return (sProduct || "") + (sDesc ? " — " + sDesc : "");
    },

    formatPlantCount: function (aPlants) {
      if (!aPlants) { return ""; }
      return aPlants.length + " division" + (aPlants.length > 1 ? "s" : "");
    },

    _i18n: function (sKey) {
      return this.getOwnerComponent()
        .getModel("i18n")
        .getResourceBundle()
        .getText(sKey);
    }
  });
});
