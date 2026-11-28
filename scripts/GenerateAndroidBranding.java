import java.awt.*;
import java.awt.geom.Ellipse2D;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import javax.imageio.ImageIO;
import java.util.Map;

public class GenerateAndroidBranding {
    private static final Color WHITE = Color.WHITE;
    private static final Color TRANSPARENT = new Color(0, 0, 0, 0);

    private static void write(BufferedImage source, Path file, int width, int height,
                              int maxMark, Color background, boolean round) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            if (round) g.setClip(new Ellipse2D.Double(0, 0, width, height));
            g.setColor(background);
            g.fillRect(0, 0, width, height);
            double scale = Math.min((double) maxMark / source.getWidth(), (double) maxMark / source.getHeight());
            int w = Math.max(1, (int) Math.round(source.getWidth() * scale));
            int h = Math.max(1, (int) Math.round(source.getHeight() * scale));
            g.drawImage(source, (width - w) / 2, (height - h) / 2, w, h, null);
        } finally { g.dispose(); }
        Files.createDirectories(file.getParent());
        if (!ImageIO.write(image, "png", file.toFile())) throw new IllegalStateException("PNG writer unavailable");
        System.out.println("[OK] " + file + " (" + width + "x" + height + ")");
    }

    public static void main(String[] args) throws Exception {
        Path sourcePath = Path.of("public", "branding", "thikanahub-icon.png");
        Path res = Path.of("android", "app", "src", "main", "res");
        if (!Files.isRegularFile(sourcePath) || !Files.isDirectory(res)) {
            throw new IllegalStateException("Run from the thikana-hub project root with existing Android and brand assets.");
        }
        BufferedImage source = ImageIO.read(sourcePath.toFile());
        if (source == null) throw new IllegalArgumentException("Invalid branding PNG");
        System.out.println("Source: " + source.getWidth() + "x" + source.getHeight());
        int generated = 0;
        Map<String, Integer> density = Map.of("mdpi", 100, "hdpi", 150, "xhdpi", 200, "xxhdpi", 300, "xxxhdpi", 400);
        for (String d : new String[]{"mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"}) {
            int factor = density.get(d);
            int legacy = 48 * factor / 100;
            int foreground = 108 * factor / 100;
            int splash = 288 * factor / 100;
            Path mipmap = res.resolve("mipmap-" + d);
            write(source, mipmap.resolve("ic_launcher.png"), legacy, legacy, 40 * factor / 100, WHITE, false);
            write(source, mipmap.resolve("ic_launcher_round.png"), legacy, legacy, 32 * factor / 100, WHITE, true);
            write(source, mipmap.resolve("ic_launcher_foreground.png"), foreground, foreground, 46 * factor / 100, TRANSPARENT, false);
            write(source, res.resolve("drawable-" + d).resolve("thikanahub_splash_icon.png"), splash, splash, 132 * factor / 100, TRANSPARENT, false);
            generated += 4;
        }
        // Preserve the template splash resource sizes for any existing resource references.
        try (var folders = Files.list(res)) {
            for (Path dir : folders.filter(Files::isDirectory).sorted().toList()) {
                if (!dir.getFileName().toString().startsWith("drawable")) continue;
                Path file = dir.resolve("splash.png");
                if (!Files.isRegularFile(file)) continue;
                BufferedImage old = ImageIO.read(file.toFile());
                if (old == null) throw new IllegalStateException("Invalid splash resource: " + file);
                int w = old.getWidth(), h = old.getHeight();
                old.flush();
                write(source, file, w, h, Math.max(1, Math.min(w, h) / 3), WHITE, false);
                generated++;
            }
        }
        System.out.println("BRANDING GENERATED: " + generated + " PNG files");
    }
}
