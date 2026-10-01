package com.kule.savunma;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.concurrent.Worker;
import javafx.geometry.Rectangle2D;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.scene.input.KeyCombination;
import javafx.scene.layout.StackPane;
import javafx.scene.web.WebView;
import javafx.stage.Screen;
import javafx.stage.Stage;
import netscape.javascript.JSObject;

public class App extends Application {

    private static final String TITLE = "Su Altı Savunma";

    private final SaveStore saveStore = new SaveStore();
    private Stage stage;

    @Override
    public void start(Stage primaryStage) {
        this.stage = primaryStage;
        SoundPlayer.init();
        WebView webView = new WebView();
        LogWriter logWriter = new LogWriter();

        webView.getEngine().getLoadWorker().stateProperty().addListener((observable, oldValue, newValue) -> {
            if (newValue == Worker.State.SUCCEEDED) {
                System.out.println("WebView yuklendi, JavaScript bridge kuruluyor...");

                webView.getEngine().executeScript(
                        "window.javaBridge = {" +
                                "startLog: function(title) {" +
                                "   alert('JAVA_LOG_START:' + title);" +
                                "}," +
                                "appendLog: function(text) {" +
                                "   alert('JAVA_LOG:' + text);" +
                                "}," +
                                "endLog: function() {" +
                                "   alert('JAVA_LOG_END');" +
                                "}," +
                                "exitApp: function() {" +
                                "   alert('JAVA_EXIT_APP');" +
                                "}," +
                                "playTone: function(freqStart, freqEnd, durationMs, waveType, volume) {" +
                                "   alert('JAVA_PLAY_TONE:' + freqStart + ',' + freqEnd + ',' + durationMs + ',' + waveType + ',' + volume);" +
                                "}," +
                                "playSfx: function(name, volume) {" +
                                "   alert('JAVA_SFX:' + name + ',' + volume);" +
                                "}," +
                                "saveData: function(json) {" +
                                "   alert('JAVA_SAVE_DATA:' + json);" +
                                "}," +
                                "setFullscreen: function(on) {" +
                                "   alert('JAVA_FULLSCREEN:' + on);" +
                                "}," +
                                "setWindowSize: function(w, h) {" +
                                "   alert('JAVA_WINDOW_SIZE:' + w + ',' + h);" +
                                "}" +
                                "};" +
                                "console.log('JavaBridge baslatildi');");

                webView.getEngine().setOnAlert(event -> handleBridgeMessage(event.getData(), logWriter));

                // kayıtlı ayarlar ve rekorlar varsa oyuna ilet
                String saved = saveStore.read();
                if (saved != null) {
                    try {
                        JSObject window = (JSObject) webView.getEngine().executeScript("window");
                        window.call("loadSavedData", saved);
                    } catch (Exception e) {
                        System.out.println("Kayit yuklenemedi: " + e.getMessage());
                    }
                }

                System.out.println("JavaScript bridge kuruldu");
            }
        });

        // geliştirme kolaylığı: -Dsavunma.hash="#map=2&diff=hard" haritayı doğrudan açar
        String htmlPath = getClass().getResource("/web/index.html").toExternalForm()
                + System.getProperty("savunma.hash", "");
        webView.getEngine().load(htmlPath);

        StackPane root = new StackPane();
        root.getChildren().add(webView);

        // pencere boyutu: ekrana göre, çok büyük ya da küçük olmasın
        Rectangle2D screen = Screen.getPrimary().getVisualBounds();
        double width = Math.min(1760, screen.getWidth() * 0.95);
        double height = Math.min(990, screen.getHeight() * 0.95);
        Scene scene = new Scene(root, width, height);

        primaryStage.setTitle(TITLE);
        addIcons(primaryStage);
        primaryStage.setScene(scene);
        // oyunda Esc tuşu kullanılıyor, tam ekrandan çıkışı bozmasın; çıkış ayarlardan ya da F11 ile
        primaryStage.setFullScreenExitHint("");
        primaryStage.setFullScreenExitKeyCombination(KeyCombination.NO_MATCH);
        primaryStage.centerOnScreen();
        primaryStage.show();
    }

    private void addIcons(Stage s) {
        for (int size : new int[] { 16, 32, 64, 128, 256 }) {
            try (var in = getClass().getResourceAsStream("/web/assets/icon_" + size + ".png")) {
                if (in != null) {
                    s.getIcons().add(new Image(in));
                }
            } catch (Exception e) {
                // simge yoksa varsayılan simge kalır
            }
        }
    }

    private void handleBridgeMessage(String data, LogWriter logWriter) {
        if (data.startsWith("JAVA_LOG_START:")) {
            logWriter.start(data.substring("JAVA_LOG_START:".length()));
        } else if (data.startsWith("JAVA_LOG:")) {
            logWriter.append(data.substring("JAVA_LOG:".length()));
        } else if (data.equals("JAVA_LOG_END")) {
            logWriter.close();
        } else if (data.equals("JAVA_EXIT_APP")) {
            logWriter.close();
            System.out.println("Uygulama kapatiliyor...");
            Platform.exit();
            System.exit(0);
        } else if (data.startsWith("JAVA_SFX:")) {
            String[] parts = data.substring("JAVA_SFX:".length()).split(",");
            SoundPlayer.playSfx(parts[0], Double.parseDouble(parts[1]));
        } else if (data.startsWith("JAVA_PLAY_TONE:")) {
            String[] parts = data.substring("JAVA_PLAY_TONE:".length()).split(",");
            double freqStart = Double.parseDouble(parts[0]);
            double freqEnd = Double.parseDouble(parts[1]);
            int durationMs = Integer.parseInt(parts[2]);
            String waveType = parts[3];
            double volume = Double.parseDouble(parts[4]);
            SoundPlayer.play(freqStart, freqEnd, durationMs, waveType, volume);
        } else if (data.startsWith("JAVA_SAVE_DATA:")) {
            saveStore.write(data.substring("JAVA_SAVE_DATA:".length()));
        } else if (data.startsWith("JAVA_FULLSCREEN:")) {
            boolean on = Boolean.parseBoolean(data.substring("JAVA_FULLSCREEN:".length()));
            stage.setFullScreen(on);
        } else if (data.startsWith("JAVA_WINDOW_SIZE:")) {
            String[] parts = data.substring("JAVA_WINDOW_SIZE:".length()).split(",");
            if (!stage.isFullScreen()) {
                Rectangle2D screen = Screen.getPrimary().getVisualBounds();
                stage.setWidth(Math.min(Double.parseDouble(parts[0]), screen.getWidth()));
                stage.setHeight(Math.min(Double.parseDouble(parts[1]), screen.getHeight()));
                stage.centerOnScreen();
            }
        } else {
            System.out.println("JavaScript Alert: " + data);
        }
    }

    public static void main(String[] args) {
        System.out.println("Uygulama baslatiliyor...");
        launch(args);
    }
}
