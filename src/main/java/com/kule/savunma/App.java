package com.kule.savunma;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.web.WebView;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;
import javafx.concurrent.Worker;

public class App extends Application {

    @Override
    public void start(Stage primaryStage) {
        WebView webView = new WebView();
        LogWriter logWriter = new LogWriter();

        webView.getEngine().getLoadWorker().stateProperty().addListener((observable, oldValue, newValue) -> {
            if (newValue == Worker.State.SUCCEEDED) {
                System.out.println("WebView yuklendi, JavaScript bridge kuruluyor...");

                webView.getEngine().executeScript(
                        "window.javaBridge = {" +
                                "saveLog: function(logContent) {" +
                                "   console.log('JavaBridge cagirildi: ' + logContent.length + ' karakter');" +
                                "   alert('JAVA_SAVE_LOG:' + logContent);" +
                                "}," +
                                "exitApp: function() {" +
                                "   alert('JAVA_EXIT_APP');" +
                                "}," +
                                "playTone: function(freqStart, freqEnd, durationMs, waveType, volume) {" +
                                "   alert('JAVA_PLAY_TONE:' + freqStart + ',' + freqEnd + ',' + durationMs + ',' + waveType + ',' + volume);" +
                                "}" +
                                "};" +
                                "console.log('JavaBridge baslatildi');");

                webView.getEngine().setOnAlert(event -> {
                    String data = event.getData();

                    if (data.startsWith("JAVA_SAVE_LOG:")) {
                        String logContent = data.substring(14);
                        System.out.println("Log kaydediliyor: " + logContent.length() + " karakter");
                        logWriter.saveLog(logContent);
                    } else if (data.equals("JAVA_EXIT_APP")) {
                        System.out.println("Uygulama kapatiliyor...");
                        Platform.exit();
                        System.exit(0);
                    } else if (data.startsWith("JAVA_PLAY_TONE:")) {
                        String[] parts = data.substring("JAVA_PLAY_TONE:".length()).split(",");
                        double freqStart = Double.parseDouble(parts[0]);
                        double freqEnd = Double.parseDouble(parts[1]);
                        int durationMs = Integer.parseInt(parts[2]);
                        String waveType = parts[3];
                        double volume = Double.parseDouble(parts[4]);
                        SoundPlayer.play(freqStart, freqEnd, durationMs, waveType, volume);
                    } else {
                        System.out.println("JavaScript Alert: " + data);
                    }
                });

                System.out.println("JavaScript bridge kuruldu");
            }
        });

        String htmlPath = getClass().getResource("/web/index.html").toExternalForm();
        webView.getEngine().load(htmlPath);

        StackPane root = new StackPane();
        root.getChildren().add(webView);

        Scene scene = new Scene(root, 1450, 900);
        primaryStage.setTitle("Kule Savunma Oyunu (JavaFX)");
        primaryStage.setScene(scene);
        primaryStage.show();
    }

    public static void main(String[] args) {
        System.out.println("Uygulama baslatiliyor...");
        launch(args);
    }
}