/*
 * Copyright 2000-2020 Vaadin Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

package com.vaadin.client;

import com.google.gwt.core.client.GWT;
import com.google.gwt.core.client.JavaScriptObject;
import com.google.gwt.core.client.Scheduler;

import com.vaadin.client.communication.LoadingIndicatorConfigurator;
import com.vaadin.client.communication.PollConfigurator;
import com.vaadin.client.communication.ReconnectDialogConfiguration;
import com.vaadin.client.flow.RouterLinkHandler;
import com.vaadin.client.flow.StateNode;
import com.vaadin.client.flow.binding.Binder;
import com.vaadin.client.flow.util.NativeFunction;

import elemental.client.Browser;
import elemental.dom.Element;
import elemental.dom.Node;

/**
 * Main class for an application / UI.
 * <p>
 * Initializes the registry and starts the application.
 *
 * @since 1.0
 */
public class ApplicationConnection {

    private final Registry registry;

    /**
     * Creates an application connection using the given configuration.
     *
     * @param applicationConfiguration
     *            the configuration object for the application
     */
    public ApplicationConnection(
            ApplicationConfiguration applicationConfiguration) {

        registry = new DefaultRegistry(this, applicationConfiguration);
        GWT.setUncaughtExceptionHandler(
                registry.getSystemErrorHandler()::handleError);

        StateNode rootNode = registry.getStateTree().getRootNode();

        // Bind UI configuration objects
        PollConfigurator.observe(rootNode, registry.getPoller());
        ReconnectDialogConfiguration.bind(registry.getConnectionStateHandler());
        LoadingIndicatorConfigurator.observe(rootNode,
                registry.getLoadingIndicator());

        Element body = Browser.getDocument().getBody();

        rootNode.setDomNode(body);
        Binder.bind(rootNode, body);

        // When app is run as a WC do not add listener for routing events.
        // Routing is responsability of the hosting application (#6108)
        if (!applicationConfiguration.isWebComponentMode()) {
            new PopStateHandler(registry).bind();
            RouterLinkHandler.bind(registry, body);
        }

        Console.log("Starting application "
                + applicationConfiguration.getApplicationId());

        String appRootPanelName = applicationConfiguration.getApplicationId();
        // remove the end (window name) of autogenerated rootpanel id
        appRootPanelName = appRootPanelName.replaceFirst("-\\d+$", "");

        boolean productionMode = applicationConfiguration.isProductionMode();
        boolean requestTiming = applicationConfiguration.isRequestTiming();
        publishJavascriptMethods(appRootPanelName, productionMode,
                requestTiming,
                applicationConfiguration.getExportedWebComponents());
        if (!productionMode) {
            String servletVersion = applicationConfiguration
                    .getServletVersion();
            publishDevelopmentModeJavascriptMethods(appRootPanelName,
                    servletVersion);
            Console.log(
                    "Vaadin application servlet version: " + servletVersion);
        }

        registry.getLoadingIndicator().show();
    }

    /**
     * Starts this application.
     * <p>
     * Called by the bootstrapper, which ensures applications are started in
     * order.
     *
     * @param initialUidl
     *            the initial UIDL or null if the server did not provide any
     */
    public void start(ValueMap initialUidl) {
        if (initialUidl == null) {
            // initial UIDL not in DOM, request from server
            registry.getMessageSender().resynchronize();
        } else {
            // initial UIDL provided in DOM, continue as if returned by request

            // Hack to avoid logging an error in endRequest()
            registry.getRequestResponseTracker().startRequest();
            registry.getMessageHandler().handleMessage(initialUidl);
        }
    }

    /**
     * Checks if there is some work to be done on the client side.
     *
     * @return true if the client has some work to be done, false otherwise
     */
    private boolean isActive() {
        return !registry.getMessageHandler().isInitialUidlHandled()
                || registry.getRequestResponseTracker().hasActiveRequest()
                || isExecutingDeferredCommands();
    }

    /**
     * Methods published to JavaScript.
     *
     * @param applicationId
     *            the application id provided by the server
     * @param productionMode
     *            <code>true</code> if running in production mode,
     *            <code>false</code> otherwise
     * @param requestTiming
     *            <code>true</code> if request timing info should be made
     *            available, <code>false</code> otherwise
     * @param exportedWebComponents
     *            a list of web component tags exported by this UI
     */
    private native void publishJavascriptMethods(String applicationId,
            boolean productionMode, boolean requestTiming,
            String[] exportedWebComponents)
    /*-{
        var ap = this;
        var client = {};
        client.isActive = $entry(function() {
            return ap.@com.vaadin.client.ApplicationConnection::isActive()();
        });
        client.getByNodeId = $entry(function(nodeId) {
            return ap.@ApplicationConnection::getDomElementByNodeId(*)(nodeId);
        });
        client.addDomBindingListener = $entry(function(nodeId, callback) {
            ap.@ApplicationConnection::addDomSetListener(*)(nodeId, callback);
        });
        client.productionMode = productionMode;
        client.poll = $entry(function() {
                var poller = ap.@ApplicationConnection::registry.@com.vaadin.client.Registry::getPoller()();
                poller.@com.vaadin.client.communication.Poller::poll()();
        });
        client.connectWebComponent = $entry(function(eventData) {
            // Connects the web component described by eventData with the server
            var registry = ap.@ApplicationConnection::registry;
            var sc = registry.@com.vaadin.client.Registry::getServerConnector()();
            var nodeId = registry.@com.vaadin.client.Registry::getStateTree()().@com.vaadin.client.flow.StateTree::getRootNode()().@com.vaadin.client.flow.StateNode::id;
            sc.@com.vaadin.client.communication.ServerConnector::sendEventMessage(ILjava/lang/String;Lelemental/json/JsonObject;)(nodeId, 'connect-web-component', eventData);
        });
        if (requestTiming) {
           client.getProfilingData = $entry(function() {
            var smh = ap.@com.vaadin.client.ApplicationConnection::registry.@com.vaadin.client.Registry::getMessageHandler()();
            var pd = [
                smh.@com.vaadin.client.communication.MessageHandler::lastProcessingTime,
                    smh.@com.vaadin.client.communication.MessageHandler::totalProcessingTime
                ];
            if (null != smh.@com.vaadin.client.communication.MessageHandler::serverTimingInfo) {
                pd = pd.concat(smh.@com.vaadin.client.communication.MessageHandler::serverTimingInfo);
            } else {
                pd = pd.concat(-1, -1);
            }
            pd[pd.length] = smh.@com.vaadin.client.communication.MessageHandler::bootstrapTime;
            return pd;
        });
        }
        client.resolveUri = $entry(function(uriToResolve) {
            var ur = ap.@ApplicationConnection::registry.@com.vaadin.client.Registry::getURIResolver()();
            return ur.@com.vaadin.client.URIResolver::resolveVaadinUri(Ljava/lang/String;)(uriToResolve);
        });
    
        client.sendEventMessage = $entry(function(nodeId, eventType, eventData) {
            var sc = ap.@ApplicationConnection::registry.@com.vaadin.client.Registry::getServerConnector()();
            sc.@com.vaadin.client.communication.ServerConnector::sendEventMessage(ILjava/lang/String;Lelemental/json/JsonObject;)(nodeId,eventType,eventData);
        });
    
        client.initializing = false;
        client.exportedWebComponents = exportedWebComponents;
        $wnd.Vaadin.Flow.clients[applicationId] = client;
    }-*/;

    private Node getDomElementByNodeId(int id) {
        StateNode node = registry.getStateTree().getNode(id);
        return node == null ? null : node.getDomNode();
    }

    private void addDomSetListener(int nodeId, JavaScriptObject callback) {
        registry.getStateTree().getNode(nodeId).addDomNodeSetListener(node -> {
            if (nodeId == node.getId()) {
                NativeFunction function = NativeFunction.create("callback",
                        "callback();");
                function.call(null, callback);
                return true;
            }
            return false;
        });
    }

    /**
     * Methods published to JavaScript on when NOT running in production mode.
     *
     * @param applicationId
     *            the application id provided by the server
     */
    private native void publishDevelopmentModeJavascriptMethods(
            String applicationId, String servletVersion)
    /*-{
        var ap = this;
        var client = $wnd.Vaadin.Flow.clients[applicationId];
        client.isActive = $entry(function() {
            return ap.@com.vaadin.client.ApplicationConnection::isActive()();
        });
        client.getVersionInfo = $entry(function(parameter) {
            return { "flow": servletVersion};
        });
        client.debug = $entry(function() {
            var registry = ap.@ApplicationConnection::registry;
            return registry.@com.vaadin.client.Registry::getStateTree()().@com.vaadin.client.flow.StateTree::getRootNode()().@com.vaadin.client.flow.StateNode::getDebugJson()();
        });
    
    }-*/;

    /**
     * Checks if deferred commands are (potentially) still being executed as a
     * result of an update from the server. Returns true if a deferred command
     * might still be executing, false otherwise. This will not work correctly
     * if a deferred command is added in another deferred command.
     * <p>
     * Used by the native "client.isActive" function.
     * </p>
     *
     * @return true if deferred commands are (potentially) being executed, false
     *         otherwise
     */
    private boolean isExecutingDeferredCommands() {
        Scheduler s = Scheduler.get();
        if (s instanceof TrackingScheduler) {
            return ((TrackingScheduler) s).hasWorkQueued();
        } else {
            return false;
        }
    }
}
